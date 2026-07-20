import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { obligationSchema } from "@/lib/schemas";

async function getId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

export const GET = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  const obligation = await prisma.obligation.findUnique({
    where: { id },
    include: {
      category: true,
      contact: true,
      transactions: { orderBy: { transactionDate: "desc" } },
    },
  });
  if (!obligation) throw new ApiError("התחייבות לא נמצאה", 404);
  return serialize(obligation);
});

export const PATCH = handler(async (req, ctx) => {
  const id = await getId(ctx);
  const body = await req.json();
  const data = obligationSchema.partial().parse(body);
  const obligation = await prisma.obligation.update({
    where: { id },
    data,
    include: { category: true, contact: true },
  });
  return serialize(obligation);
});

export const DELETE = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  await prisma.obligation.delete({ where: { id } });
  return { ok: true };
});
