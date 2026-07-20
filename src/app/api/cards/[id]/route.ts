import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { creditCardSchema } from "@/lib/schemas";

async function getId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

export const PATCH = handler(async (req, ctx) => {
  const id = await getId(ctx);
  const body = await req.json();
  const data = creditCardSchema.partial().parse(body);

  const card = await prisma.$transaction(async (tx) => {
    const existing = await tx.creditCard.findUnique({ where: { id } });
    if (!existing) throw new ApiError("כרטיס לא נמצא", 404);
    if (data.isDefault) {
      await tx.creditCard.updateMany({
        where: { contactId: existing.contactId },
        data: { isDefault: false },
      });
    }
    return tx.creditCard.update({ where: { id }, data });
  });

  return serialize(card);
});

export const DELETE = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  await prisma.creditCard.delete({ where: { id } });
  return { ok: true };
});
