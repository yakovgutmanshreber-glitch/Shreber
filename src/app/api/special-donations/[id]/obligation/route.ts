import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";

async function getId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

// POST — the person accepted to pay: create an Obligation from this donation.
export const POST = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  const d = await prisma.specialDonation.findUnique({ where: { id } });
  if (!d) throw new ApiError("רשומה לא נמצאה", 404);
  if (d.obligationId) {
    const existing = await prisma.obligation.findUnique({ where: { id: d.obligationId } });
    if (existing) return serialize({ ok: true, obligationId: existing.id, obligation: existing });
  }
  const obligation = await prisma.obligation.create({
    data: {
      kind: "income",
      contactId: d.contactId,
      categoryId: d.categoryId, // the גליון
      chargeType: "onetime",
      recurringAmount: d.amount,
      numPayments: 1,
      startDate: d.entryDate ?? new Date(),
      status: "active",
      paymentMethod: "cash",
      comment: `מתרומה מיוחדת${d.occasion ? " — לרגל " + d.occasion : ""}`,
    },
  });
  await prisma.specialDonation.update({ where: { id }, data: { obligationId: obligation.id } });
  return serialize({ ok: true, obligationId: obligation.id, obligation });
});

// DELETE — unchecked: remove the linked obligation (only if it has no transactions).
export const DELETE = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  const d = await prisma.specialDonation.findUnique({ where: { id } });
  if (!d) throw new ApiError("רשומה לא נמצאה", 404);
  if (d.obligationId) {
    const txCount = await prisma.transaction.count({ where: { obligationId: d.obligationId } });
    if (txCount > 0) {
      throw new ApiError("להתחייבות כבר יש עסקאות ולכן לא ניתן לבטל אותה מכאן", 400);
    }
    await prisma.obligation.delete({ where: { id: d.obligationId } }).catch(() => {});
    await prisma.specialDonation.update({ where: { id }, data: { obligationId: null } });
  }
  return { ok: true };
});
