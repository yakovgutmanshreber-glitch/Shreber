import { NextResponse } from "next/server";
import { syncRecordings } from "@/lib/yemot/sync";

// ---------------------------------------------------------------------------
// Recordings sync — call periodically from an external scheduler:
//   GET /api/cron/recordings?secret=<RECORDINGS_CRON_SECRET | TASKS_CRON_SECRET>
// Pulls any new Yemot recordings into the DB and matches them to contacts, so
// recordings are captured "from today onwards" even if nobody opens the page.
// ---------------------------------------------------------------------------
async function run(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.RECORDINGS_CRON_SECRET || process.env.TASKS_CRON_SECRET;
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (expected && provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncRecordings();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
export const maxDuration = 60;
