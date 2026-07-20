import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { categorySchema } from "@/lib/schemas";

async function getId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

export const PATCH = handler(async (req, ctx) => {
  const id = await getId(ctx);
  const body = await req.json();
  const data = categorySchema.partial().parse(body);
  const category = await prisma.category.update({ where: { id }, data });
  return serialize(category);
});

export const DELETE = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  await prisma.category.delete({ where: { id } });
  return { ok: true };
});
