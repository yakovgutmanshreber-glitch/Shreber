import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { KESHER_SUCCESS_CODES } from "@/lib/constants";

// Outstanding-balance report: every obligation whose נשאר (full commitment
// minus what was actually paid) is still greater than 0. Unlimited (ongoing)
// hoks and cancelled obligations are excluded — they have no fixed balance.
export const GET = handler(async (req) => {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind"); // optional 'income' | 'expense'

  const obligations = await prisma.obligation.findMany({
    where: kind ? { kind } : {},
    include: {
      contact: true,
      category: true,
      transactions: { select: { amount: true, amountIls: true, statusCode: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = [];
  for (const o of obligations) {
    if (!o.contactId) continue; // only debts linked to a contact (not standalone הכנסות)
    if (o.status === "cancelled") continue;
    if (o.numPayments === 9999) continue; // ongoing → no fixed total
    const amt = Number(o.amountIls ?? o.recurringAmount);
    const n = o.numPayments;
    const numPay = o.chargeType === "onetime" ? 1 : n;
    const perPayment = o.chargeType === "installments" ? (n > 0 ? amt / n : amt) : amt;
    const total = o.chargeType === "installments" ? amt : perPayment * numPay;
    const paid = o.transactions
      .filter((t) => t.statusCode != null && KESHER_SUCCESS_CODES.has(t.statusCode))
      .reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
    const remaining = total - paid;
    if (remaining <= 0.001) continue;
    rows.push({
      id: o.id,
      contactId: o.contactId,
      name: o.contact
        ? `${o.contact.firstName} ${o.contact.lastName ?? ""}`.trim()
        : o.category?.category ?? "—",
      category: o.category?.category ?? null,
      remaining,
      currency: o.currency,
      comment: o.comment,
    });
  }
  rows.sort((a, b) => b.remaining - a.remaining);
  return serialize(rows);
});
