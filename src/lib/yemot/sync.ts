import { prisma } from "@/lib/prisma";
import { listRecordings } from "./client";

/** Normalize an Israeli phone for comparison: digits only, 972→0 prefix. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d || null;
}

/**
 * Parse Yemot's "DD/MM/YYYY HH:MM" (Israel wall-clock) into a Date whose UTC
 * fields hold that wall-clock — so ordering is correct and formatting with
 * timeZone:"UTC" shows exactly the time the caller saw.
 */
export function parseYemotDate(s: string): Date {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return new Date();
  const [, dd, mm, yyyy, hh = "0", mi = "0"] = m;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi)));
}

/**
 * Pull recordings from the dedicated extension-6 folder (ivr2:/6/1) into the DB,
 * matching each to a Contact by the caller's phone. Because that folder is
 * exclusive to extension 6, every file in it is a real ext-6 recording — so we
 * import all of them (new ones by uniqueId). Idempotent — safe to call on every
 * page load and from the cron.
 */
export async function syncRecordings(): Promise<{ added: number; total: number }> {
  const recs = await listRecordings();
  if (recs.length === 0) return { added: 0, total: 0 };

  const existing = new Set(
    (await prisma.callRecording.findMany({ select: { uniqueId: true } })).map((r) => r.uniqueId),
  );
  const fresh = recs.filter((r) => !existing.has(r.uniqueId));
  if (fresh.length === 0) return { added: 0, total: recs.length };

  // Build a normalized phone → contactId index once.
  const contacts = await prisma.contact.findMany({ select: { id: true, phone: true, phone2: true } });
  const byPhone = new Map<string, number>();
  for (const c of contacts) {
    for (const p of [c.phone, c.phone2]) {
      const n = normalizePhone(p);
      if (n && !byPhone.has(n)) byPhone.set(n, c.id);
    }
  }

  let added = 0;
  for (const r of fresh) {
    const n = normalizePhone(r.caller);
    const contactId = n ? byPhone.get(n) ?? null : null;
    try {
      await prisma.callRecording.create({
        data: {
          uniqueId: r.uniqueId,
          fileName: r.name,
          phone: r.caller,
          contactId,
          durationSec: Math.round(r.duration || 0),
          recordedAt: parseYemotDate(r.date),
        },
      });
      added++;
    } catch {
      // Unique-constraint race (concurrent sync) — ignore.
    }
  }
  return { added, total: recs.length };
}
