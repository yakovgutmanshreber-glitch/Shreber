// Yemot HaMashiach (call2all) API client — read recordings from an extension.
// Auth: Login(username,password) -> token (valid ~60 min); every call needs it.
// Docs: https://www.call2all.co.il/ym/api/<Function>

const BASE = "https://www.call2all.co.il/ym/api";

export class YemotConfigError extends Error {}

function creds() {
  const username = process.env.YEMOT_USERNAME;
  const password = process.env.YEMOT_PASSWORD;
  if (!username || !password) {
    throw new YemotConfigError("נדרשים YEMOT_USERNAME / YEMOT_PASSWORD (הגדר ב-Vercel).");
  }
  return { username, password };
}

/** The extension that holds the recordings. */
export function recordingsExt(): string {
  return process.env.YEMOT_RECORDINGS_EXT || "68";
}

// Cache the login token in-memory (per server instance).
let cached: { token: string; expires: number } | null = null;

async function getToken(force = false): Promise<string> {
  if (!force && cached && cached.expires > Date.now()) return cached.token;
  const { username, password } = creds();
  const res = await raw("Login", { username, password });
  if (res.responseStatus !== "OK" || !res.token) {
    throw new Error(res.message ?? "התחברות לימות נכשלה");
  }
  cached = { token: res.token, expires: Date.now() + 50 * 60 * 1000 };
  return res.token;
}

async function raw(fn: string, params: Record<string, string>): Promise<Record<string, unknown> & { responseStatus?: string; message?: string; token?: string }> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}/${fn}?${qs}`, { signal: AbortSignal.timeout(30_000) });
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { responseStatus: "ERROR", message: t.slice(0, 200) };
  }
}

/** Call an API function with the session token, retrying once on an auth failure. */
async function call(fn: string, params: Record<string, string> = {}): Promise<Record<string, unknown> & { responseStatus?: string; message?: string }> {
  let res = await raw(fn, { ...params, token: await getToken() });
  if (res.responseStatus === "ERROR" && /token|login|session/i.test(String(res.message ?? ""))) {
    res = await raw(fn, { ...params, token: await getToken(true) });
  }
  return res;
}

export interface YemotRecording {
  name: string;
  uniqueId: string;
  size: number;
  duration: number;
  durationStr: string;
  date: string; // DD/MM/YYYY HH:MM (as Yemot sends)
  title: string | null; // meta.title if set
  caller: string | null; // caller id / source phone if present
}

/** List the AUDIO recordings in an extension (newest handling done by caller). */
export async function listRecordings(ext = recordingsExt()): Promise<YemotRecording[]> {
  const res = await call("GetIVR2Dir", { path: `ivr2:/${ext}` });
  if (res.responseStatus !== "OK") throw new Error(res.message ?? "שליפת ההקלטות מימות נכשלה");
  const files = (res.files as Record<string, unknown>[] | undefined) ?? [];
  return files
    .filter((f) => f.fileType === "AUDIO" || /\.(wav|mp3)$/i.test(String(f.name)))
    .map((f) => {
      const meta = (f.meta as { title?: string } | undefined) ?? {};
      return {
        name: String(f.name),
        uniqueId: String(f.uniqueId ?? f.name),
        size: Number(f.size ?? 0),
        duration: Number(f.duration ?? 0),
        durationStr: String(f.durationStr ?? ""),
        date: String(f.date ?? f.mtime ?? ""),
        title: meta.title ?? null,
        caller: (f.callerId as string) ?? (f.phone as string) ?? null,
      };
    });
}

/** Fetch a recording's audio (streamed) for a given extension + file name. */
export async function downloadRecording(ext: string, name: string): Promise<Response> {
  const token = await getToken();
  const url = `${BASE}/DownloadFile?${new URLSearchParams({ token, path: `ivr2:/${ext}/${name}` })}`;
  return fetch(url, { signal: AbortSignal.timeout(60_000) });
}
