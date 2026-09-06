import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";

// Records that arrived from Kesher but couldn't be linked to a contact (no
// phone match). Shown in the "רשומות ללא שיוך" review screen.
export const GET = handler(async () => {
  const [obligations, transactions] = await Promise.all([
    prisma.obligation.findMany({
      // Truly unhandled: from Kesher, with NO contact AND NO category. Standalone
      // income obligations already have a category and show in הכנסות, so they're
      // excluded here to avoid appearing in both places.
      where: { contactId: null, categoryId: null, kesherObligationReference: { not: null } },
      include: { category: { select: { category: true } }, _count: { select: { transactions: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.transaction.findMany({
      where: { contactId: null, obligationId: null, source: "api" },
      orderBy: { transactionDate: "desc" },
      take: 500,
    }),
  ]);

  return serialize({
    obligations: obligations.map((o) => ({
      id: o.id,
      reference: o.kesherObligationReference,
      category: o.category?.category ?? null,
      amount: o.recurringAmount,
      currency: o.currency,
      status: o.status,
      transactions: o._count.transactions,
      startDate: o.startDate,
      payerName: o.payerName,
      payerPhone: o.payerPhone,
      projectName: o.projectName,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      numTransaction: t.kesherNumTransaction,
      reference: t.kesherObligationReference,
      amount: t.amount,
      currency: t.currency,
      amountIls: t.amountIls,
      date: t.transactionDate,
      statusCode: t.statusCode,
      statusText: t.statusText,
      chargeOptionType: t.chargeOptionType,
      cardLast4: t.cardLast4,
      cardExpiry: t.cardExpiry,
      authNum: t.authNum,
      receiptDocNumber: t.receiptDocNumber,
      comment: t.comment,
      payerName: t.payerName,
      payerPhone: t.payerPhone,
      projectName: t.projectName,
    })),
  });
});

// Two actions:
//  • assign a contact to an unlinked obligation (+ its transactions) or transaction;
//  • send an unlinked transaction to הכנסות (standalone income, no customer) by
//    creating a one-time income obligation under a category and linking it.
export const POST = handler(async (req) => {
  const { obligationId, transactionId, contactId, categoryId } = (await req.json()) as {
    obligationId?: number;
    transactionId?: number;
    contactId?: number;
    categoryId?: number;
  };

  // A transaction + a category → wrap it in a one-time income obligation under
  // that category (optionally linked to a contact) and attach the transaction.
  // (Transactions have no category of their own — the obligation carries it.)
  if (transactionId && categoryId) {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new ApiError("עסקה לא נמצאה", 404);
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new ApiError("קטגוריה לא נמצאה", 404);
    if (contactId) {
      const contact = await prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) throw new ApiError("איש קשר לא נמצא", 404);
    }
    const obl = await prisma.obligation.create({
      data: {
        kind: "income",
        contactId: contactId ?? null,
        categoryId,
        chargeType: "onetime",
        recurringAmount: tx.amount,
        currency: tx.currency,
        numPayments: 1,
        startDate: tx.transactionDate,
        status: "active",
        paymentMethod: (tx.chargeOptionType as string) ?? "credit",
        comment: contactId ? "שויך מרשומות ללא שיוך" : "נרשם בהכנסות מרשומות ללא שיוך",
      },
    });
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { obligationId: obl.id, contactId: contactId ?? null },
    });
    return { ok: true };
  }

  // Otherwise: assign a contact.
  if (!contactId) throw new ApiError("נדרש איש קשר", 400);
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ApiError("איש קשר לא נמצא", 404);

  if (obligationId) {
    // Optionally set a category on the obligation at the same time.
    const oblData: { contactId: number; categoryId?: number } = { contactId };
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new ApiError("קטגוריה לא נמצאה", 404);
      oblData.categoryId = categoryId;
    }
    await prisma.obligation.update({ where: { id: obligationId }, data: oblData });
    await prisma.transaction.updateMany({ where: { obligationId }, data: { contactId } });
  }
  if (transactionId) {
    await prisma.transaction.update({ where: { id: transactionId }, data: { contactId } });
  }
  return { ok: true };
});
