import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";

// GET /api/sent-emails — the email send log (most recent first).
export const GET = handler(async () => {
  const rows = await prisma.sentEmail.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  // Attach contact names for rows that have a contactId.
  const ids = [...new Set(rows.map((r) => r.contactId).filter((x): x is number => x != null))];
  const contacts = ids.length
    ? await prisma.contact.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameById = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName ?? ""}`.trim()]));
  return serialize(
    rows.map((r) => ({
      id: r.id,
      to: r.to,
      subject: r.subject,
      html: r.html,
      kind: r.kind,
      status: r.status,
      error: r.error,
      createdAt: r.createdAt,
      contactId: r.contactId,
      contactName: r.contactId ? nameById.get(r.contactId) ?? null : null,
    })),
  );
});
