import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { KESHER_SUCCESS_CODES } from "@/lib/constants";

// Transactions report: every transaction in a date range, flagged
// passed (עבר בהצלחה) or not, for the דוחות interface.
export const GET = handler(async (req) => {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const kind = searchParams.get("kind"); // 'income' | 'expense'

  const where: Record<string, unknown> = {};
  if (kind) where.kind = kind;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(`${from}T00:00:00`);
    if (to) range.lte = new Date(`${to}T23:59:59`);
    where.transactionDate = range;
  }

  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { transactionDate: "desc" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      obligation: { select: { category: { select: { category: true } } } },
    },
  });

  const rows = txs.map((t) => ({
    id: t.id,
    date: t.transactionDate,
    contactId: t.contactId,
    name: t.contact
      ? `${t.contact.firstName} ${t.contact.lastName ?? ""}`.trim()
      : t.obligation?.category?.category ?? "—",
    category: t.obligation?.category?.category ?? null,
    amount: t.amount,
    currency: t.currency,
    amountIls: t.amountIls,
    source: t.source,
    statusCode: t.statusCode,
    statusText: t.statusText,
    passed: t.statusCode != null && KESHER_SUCCESS_CODES.has(t.statusCode),
  }));

  return serialize(rows);
});

export const maxDuration = 30;
