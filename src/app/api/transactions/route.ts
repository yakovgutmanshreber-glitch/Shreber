import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { transactionSchema } from "@/lib/schemas";
import { convertToIls } from "@/lib/currency";

export const GET = handler(async (req) => {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const standalone = searchParams.get("standalone");
  const contactId = searchParams.get("contactId");
  const obligationId = searchParams.get("obligationId");

  const where: Record<string, unknown> = {};
  if (kind) where.kind = kind;
  if (standalone === "true") where.contactId = null;
  if (contactId) where.contactId = Number(contactId);
  if (obligationId) where.obligationId = Number(obligationId);

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { transactionDate: "desc" },
    include: { obligation: { include: { category: true } }, contact: true },
  });
  return serialize(transactions);
});

// Manual transactions (cash/check/bank) are inserted directly — they skip the
// Kesher API entirely (spec §5). source defaults to 'manual'.
export const POST = handler(async (req) => {
  const body = await req.json();
  const data = transactionSchema.parse(body);

  // If linked to an obligation and kind not explicitly set, inherit from it.
  if (data.obligationId && !body.kind) {
    const obl = await prisma.obligation.findUnique({ where: { id: data.obligationId } });
    if (obl) data.kind = obl.kind as "income" | "expense";
  }

  const { exchangeRate, amountIls } = await convertToIls(Number(data.amount), data.currency);
  const transaction = await prisma.transaction.create({
    data: { ...data, exchangeRate, amountIls },
    include: { obligation: true, contact: true },
  });
  return serialize(transaction);
});
