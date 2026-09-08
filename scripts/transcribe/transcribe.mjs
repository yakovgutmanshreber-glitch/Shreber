// Local Whisper transcription for Yemot recordings — no Python, no ffmpeg, no
// cloud, no API key. Runs entirely on this machine via @xenova/transformers.
//
// It finds CallRecording rows with no transcript, downloads each audio file
// straight from Yemot, transcribes it in Hebrew locally, and writes the text
// back to the database. Safe to re-run: it only touches rows still missing a
// transcript. The Whisper model downloads once on the first run (~250MB).
//
// Run:  cd scripts/transcribe && npm install && npm start
// Env is read from the project's root .env (DATABASE_URL/DIRECT_URL + YEMOT_*).

import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import wavefile from "wavefile";
import { pipeline, env } from "@xenova/transformers";

const { WaveFile } = wavefile;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MODEL = process.env.WHISPER_MODEL || "Xenova/whisper-small"; // small = good Hebrew; use whisper-base for speed
const YBASE = "https://www.call2all.co.il/ym/api";
const YPATH = process.env.YEMOT_RECORDINGS_PATH || "6/1";
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!DB_URL) throw new Error("Missing DIRECT_URL/DATABASE_URL in .env");
if (!process.env.YEMOT_USERNAME || !process.env.YEMOT_PASSWORD) throw new Error("Missing YEMOT_USERNAME/YEMOT_PASSWORD in .env");

env.allowLocalModels = false; // always fetch from the HuggingFace hub cache

async function yemotToken() {
  const r = await fetch(`${YBASE}/Login?${new URLSearchParams({ username: process.env.YEMOT_USERNAME, password: process.env.YEMOT_PASSWORD })}`);
  const j = await r.json();
  if (!j.token) throw new Error("Yemot login failed: " + (j.message || "no token"));
  return j.token;
}

const normalizePhone = (raw) => {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d || null;
};

const parseYemotDate = (s) => {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return new Date();
  const [, dd, mm, yyyy, hh = "0", mi = "0"] = m;
  return new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi));
};

// Pull any new recordings from Yemot (ivr2:/6/1) into the DB, matched to a
// contact by caller phone. Mirrors the app's sync so this task is self-contained.
async function syncNew(client, token) {
  const r = await fetch(`${YBASE}/GetIVR2Dir?${new URLSearchParams({ token, path: `ivr2:/${YPATH}` })}`);
  const j = await r.json();
  const files = (j.files || []).filter((f) => f.fileType === "AUDIO" || /\.(wav|mp3)$/i.test(String(f.name)));
  if (files.length === 0) return 0;

  const { rows: exRows } = await client.query(`SELECT "uniqueId" FROM "CallRecording"`);
  const existing = new Set(exRows.map((r) => r.uniqueId));

  const { rows: contacts } = await client.query(`SELECT id, phone, phone2 FROM "Contact"`);
  const byPhone = new Map();
  for (const c of contacts) for (const p of [c.phone, c.phone2]) {
    const n = normalizePhone(p);
    if (n && !byPhone.has(n)) byPhone.set(n, c.id);
  }

  let added = 0;
  for (const f of files) {
    const uniqueId = String(f.uniqueId ?? f.name);
    if (existing.has(uniqueId)) continue;
    const n = normalizePhone(f.phone);
    const contactId = n ? byPhone.get(n) ?? null : null;
    try {
      await client.query(
        `INSERT INTO "CallRecording" ("uniqueId","fileName","phone","contactId","durationSec","recordedAt","handled","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,false,now()) ON CONFLICT ("uniqueId") DO NOTHING`,
        [uniqueId, String(f.name), f.phone ?? null, contactId, Math.round(f.duration || 0), parseYemotDate(f.date)],
      );
      added++;
    } catch { /* ignore */ }
  }
  return added;
}

async function downloadWav(token, name) {
  const url = `${YBASE}/DownloadFile?${new URLSearchParams({ token, path: `ivr2:/${YPATH}/${name}` })}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${name} → HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Decode a WAV buffer into a mono Float32Array at 16kHz (what Whisper expects).
function wavToAudio(buf) {
  const wav = new WaveFile(buf);
  wav.toBitDepth("32f");
  wav.toSampleRate(16000);
  let samples = wav.getSamples();
  if (Array.isArray(samples)) {
    // Multi-channel → average to mono.
    const [a, ...rest] = samples;
    const out = Float32Array.from(a);
    for (const ch of rest) for (let i = 0; i < out.length; i++) out[i] += ch[i];
    const n = samples.length;
    for (let i = 0; i < out.length; i++) out[i] /= n;
    return out;
  }
  return Float32Array.from(samples);
}

async function main() {
  console.log(`[transcribe] model=${MODEL} path=ivr2:/${YPATH}`);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  // 1) Pull any new recordings from Yemot into the DB (self-contained automation).
  const token = await yemotToken();
  const added = await syncNew(client, token);
  if (added) console.log(`[transcribe] synced ${added} new recording(s) from Yemot.`);

  // 2) Transcribe everything still missing a transcript.
  const { rows } = await client.query(
    `SELECT id, "fileName" FROM "CallRecording" WHERE transcript IS NULL ORDER BY "recordedAt" ASC`,
  );
  if (rows.length === 0) {
    console.log("[transcribe] nothing to do — all recordings already transcribed.");
    await client.end();
    return;
  }
  console.log(`[transcribe] ${rows.length} recording(s) to transcribe. Loading Whisper (first run downloads the model)…`);

  const transcriber = await pipeline("automatic-speech-recognition", MODEL);

  let done = 0;
  for (const r of rows) {
    try {
      const buf = await downloadWav(token, r.fileName);
      const audio = wavToAudio(buf);
      const out = await transcriber(audio, { language: "hebrew", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
      const text = (out.text || "").trim();
      await client.query(`UPDATE "CallRecording" SET transcript=$1, "transcribedAt"=now() WHERE id=$2`, [text || "(לא זוהה דיבור)", r.id]);
      done++;
      console.log(`  ✓ ${r.fileName}: ${text ? text.slice(0, 80) : "(empty)"}`);
    } catch (e) {
      console.log(`  ✗ ${r.fileName}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await client.end();
  console.log(`[transcribe] done — transcribed ${done}/${rows.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
