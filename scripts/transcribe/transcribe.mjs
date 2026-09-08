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
  const token = await yemotToken();

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
