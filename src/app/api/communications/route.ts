import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { communicationSchema } from "@/lib/schemas";

// GET communications for an obligation (?obligationId=) or transaction (?transactionId=).
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const obligationId = sp.get("obligationId");
  const transactionId = sp.get("transactionId");
  const where = obligationId
    ? { obligationId: Number(obligationId) }
    : transactionId
      ? { transactionId: Number(transactionId) }
      : undefined;
  if (!where) throw new ApiError("נדרש obligationId או transactionId", 400);
  const rows = await prisma.communication.findMany({ where, orderBy: { date: "desc" } });
  return serialize(rows);
});

export const POST = handler(async (req) => {
  const data = communicationSchema.parse(await req.json());
  if (!data.obligationId && !data.transactionId) {
    throw new ApiError("יש לקשר את השיחה להתחייבות או לעסקה", 400);
  }
  const row = await prisma.communication.create({
    data: {
      obligationId: data.obligationId ?? null,
      transactionId: data.transactionId ?? null,
      note: data.note,
      date: data.date ?? new Date(),
    },
  });
  return serialize(row);
});
