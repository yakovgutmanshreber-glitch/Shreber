import { NextResponse } from "next/server";
import { requireUser, ApiError } from "@/lib/api";
import { downloadRecording } from "@/lib/yemot/client";

// GET /api/yemot/recordings/audio?name=<file> — stream a recording's audio
// (proxied through our server so the Yemot token is never exposed).
export async function GET(req: Request) {
  try {
    await requireUser();
    const name = new URL(req.url).searchParams.get("name");
    if (!name || name.includes("/") || name.includes("..")) {
      throw new ApiError("שם קובץ לא תקין", 400);
    }
    const res = await downloadRecording(name);
    if (!res.ok || !res.body) throw new ApiError("הורדת ההקלטה מימות נכשלה", 502);
    const type = /\.mp3$/i.test(name) ? "audio/mpeg" : "audio/wav";
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": type,
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
