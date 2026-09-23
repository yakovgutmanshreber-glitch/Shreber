import { NextResponse } from "next/server";
import { requireUser, ApiError } from "@/lib/api";
import { downloadRecording } from "@/lib/yemot/client";

// GET /api/yemot/recordings/audio?name=<file> — stream a recording's audio
// (proxied through our server so the Yemot token is never exposed).
// We buffer the full file and return it with Content-Length + Range support, so
// the browser can compute the duration and seek — without Content-Length many
// browsers show 0:00 and refuse to play.
export async function GET(req: Request) {
  try {
    await requireUser();
    const name = new URL(req.url).searchParams.get("name");
    if (!name || name.includes("/") || name.includes("..")) {
      throw new ApiError("שם קובץ לא תקין", 400);
    }
    const res = await downloadRecording(name);
    if (!res.ok) throw new ApiError("הורדת ההקלטה מימות נכשלה", 502);
    const full = Buffer.from(await res.arrayBuffer());
    const total = full.length;
    if (total === 0) throw new ApiError("קובץ ההקלטה ריק", 502);
    const type = /\.mp3$/i.test(name) ? "audio/mpeg" : "audio/wav";

    // Honor a Range request (seeking) with a 206 partial response.
    const range = req.headers.get("range");
    const m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (start <= end && end < total) {
        const chunk = full.subarray(start, end + 1);
        return new NextResponse(chunk, {
          status: 206,
          headers: {
            "Content-Type": type,
            "Content-Length": String(chunk.length),
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    }

    return new NextResponse(full, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "שגיאה" }, { status: 500 });
  }
}

export const maxDuration = 60;
