import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { transactionSchema } from "@/lib/schemas";

async function getId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

export const PATCH = handler(async (req, ctx) => {
  const id = await getId(ctx);
  const body = await req.json();
  const data = transactionSchema.partial().parse(body);
  const transaction = await prisma.transaction.update({
    where: { id },
    data,
    include: { obligation: true, contact: true },
  });
  return serialize(transaction);
});

export const DELETE = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  await prisma.transaction.delete({ where: { id } });
  return { ok: true };
});
