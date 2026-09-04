import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, notifyRecipient } from "@/lib/mail";

// ---------------------------------------------------------------------------
// Reminder dispatcher — call this every minute from an external scheduler
// (e.g. cron-job.org):  GET /api/cron/tasks?secret=<TASKS_CRON_SECRET>
//
// Sends one email per task whose due date/time has arrived and that hasn't been
// notified yet, then flags it so it never emails twice.
// ---------------------------------------------------------------------------

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(d);
}

async function run(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.TASKS_CRON_SECRET;
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (expected && provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.task.findMany({
    where: { done: false, notified: false, dueAt: { lte: now } },
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
    orderBy: { dueAt: "asc" },
    take: 100,
  });

  const to = notifyRecipient();
  let sent = 0;
  const errors: string[] = [];

  for (const t of due) {
    const contact = t.contact
      ? `${t.contact.firstName}${t.contact.lastName ? " " + t.contact.lastName : ""}${
          t.contact.phone ? " · " + t.contact.phone : ""
        }`
      : null;
    const lines = [
      `תזכורת למשימה: ${t.title}`,
      "",
      `מועד: ${fmt(t.dueAt)}`,
      contact ? `איש קשר: ${contact}` : null,
      t.notes ? `\nהערות:\n${t.notes}` : null,
    ].filter(Boolean);
    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b">
        <h2 style="margin:0 0 12px">🔔 ${escapeHtml(t.title)}</h2>
        <p style="margin:4px 0"><b>מועד:</b> ${fmt(t.dueAt)}</p>
        ${contact ? `<p style="margin:4px 0"><b>איש קשר:</b> ${escapeHtml(contact)}</p>` : ""}
        ${t.notes ? `<p style="margin:12px 0;white-space:pre-wrap">${escapeHtml(t.notes)}</p>` : ""}
      </div>`;

    try {
      await sendMail({ to, subject: `תזכורת: ${t.title}`, text: lines.join("\n"), html });
      await prisma.task.update({
        where: { id: t.id },
        data: { notified: true, notifiedAt: new Date() },
      });
      sent++;
    } catch (e) {
      errors.push(`#${t.id}: ${e instanceof Error ? e.message : "send error"}`);
    }
  }

  return NextResponse.json({ ok: true, checked: due.length, sent, errors });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

export const GET = run;
export const POST = run;
export const maxDuration = 60;
