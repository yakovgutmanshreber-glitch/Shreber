import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { obligationSchema } from "@/lib/schemas";
import { convertToIls } from "@/lib/currency";

export const GET = handler(async (req) => {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind"); // 'income' | 'expense'
  const standalone = searchParams.get("standalone"); // 'true' => contactId null
  const contactId = searchParams.get("contactId");

  const where: Record<string, unknown> = {};
  if (kind) where.kind = kind;
  if (standalone === "true") where.contactId = null;
  if (contactId) where.contactId = Number(contactId);

  const obligations = await prisma.obligation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      contact: true,
      _count: { select: { transactions: true } },
    },
  });
  return serialize(obligations);
});

export const POST = handler(async (req) => {
  const body = await req.json();
  const data = obligationSchema.parse(body);
  const { exchangeRate, amountIls } = await convertToIls(Number(data.recurringAmount), data.currency);
  const obligation = await prisma.obligation.create({
    data: { ...data, exchangeRate, amountIls },
    include: { category: true, contact: true },
  });
  return serialize(obligation);
});
