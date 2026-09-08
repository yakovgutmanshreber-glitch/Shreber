import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { syncRecordings } from "@/lib/yemot/sync";

function dateText(d: Date): string {
  // recordedAt holds Israel wall-clock in its UTC fields (see parseYemotDate).
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(d);
}

// GET /api/recordings — the recordings log (most recent first), with contact names.
export const GET = handler(async () => {
  const rows = await prisma.callRecording.findMany({
    orderBy: { recordedAt: "desc" },
    take: 500,
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  });
  return serialize(
    rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      phone: r.phone,
      durationSec: r.durationSec,
      recordedAt: r.recordedAt,
      dateText: dateText(r.recordedAt),
      handled: r.handled,
      note: r.note,
      transcript: r.transcript,
      contactId: r.contactId,
      contactName: r.contact ? `${r.contact.firstName} ${r.contact.lastName ?? ""}`.trim() : null,
    })),
  );
});

// POST /api/recordings — pull new recordings from Yemot into the DB.
export const POST = handler(async () => {
  const result = await syncRecordings();
  return serialize(result);
});

export const maxDuration = 60;
