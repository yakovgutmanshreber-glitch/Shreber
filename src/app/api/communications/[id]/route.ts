import { prisma } from "@/lib/prisma";
import { handler, ApiError } from "@/lib/api";

export const DELETE = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  await prisma.communication.delete({ where: { id: n } });
  return { ok: true };
});
