import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { kesher, looksLikeCardNumber } from "@/lib/kesher/client";
import { z } from "zod";

const schema = z.object({
  cardId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().optional(), // default = remaining balance
});

function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return String(o[k]);
  return undefined;
}

const TX_SUCCESS = new Set([0, 4, 11, 22]);

// POST /api/obligations/[id]/charge-balance  { cardId, amount? }
// Charge the obligation's remaining balance to a saved card via Kesher and record
// the transaction. Amount defaults to (obligation amount - already paid).
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const oblId = Number(id);
    if (!Number.isInteger(oblId)) throw new ApiError("מזהה לא תקין", 400);
    const { cardId, amount } = schema.parse(await req.json());

    const obligation = await prisma.obligation.findUnique({
      where: { id: oblId },
      include: { contact: true, transactions: { select: { amount: true, statusCode: true } } },
    });
    if (!obligation) throw new ApiError("התחייבות לא נמצאה", 404);

    const paid = obligation.transactions
      .filter((t) => t.statusCode != null && TX_SUCCESS.has(t.statusCode))
      .reduce((s, t) => s + Number(t.amount), 0);
    const balance = Number(obligation.recurringAmount) - paid;
    const chargeAmount = amount ?? balance;
    if (chargeAmount <= 0) throw new ApiError("אין יתרה לחיוב", 400);

    const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
    if (!card) throw new ApiError("כרטיס לא נמצא", 404);
    if (looksLikeCardNumber(card.token)) {
      throw new ApiError(
        "לכרטיס זה אין טוקן תקין בקשר. יש למחוק ולהוסיף אותו מחדש דרך 'כרטיסי אשראי'.",
        400,
      );
    }

    const c = obligation.contact;
    const uniqNum = `B${Date.now()}${Math.floor(Math.random() * 100)}`.slice(0, 19);
    let res;
    try {
      res = await kesher.sendTransaction({
        amount: chargeAmount,
        uniqNum,
        token: card.token,
        cardExpiry: card.expiry ?? undefined,
        comment: `יתרה להתחייבות ${oblId}`,
        tz: c?.tz ?? undefined,
        firstName: c?.firstName,
        lastName: c?.lastName ?? undefined,
        phone: c?.phone ?? undefined,
        mail: c?.email ?? undefined,
        address: c?.address ?? undefined,
        city: c?.city ?? undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאת רשת";
      throw new ApiError(`החיבור לקשר נכשל (${msg}). לא בוצע חיוב.`, 502);
    }
    if (!res.ok) throw new ApiError(res.message ?? "החיוב נדחה על ידי חברת האשראי", 402);

    const d = res.data ?? res.raw;
    const numTransaction = pick(d, "NumTransaction") ?? (res.mock ? uniqNum : undefined);
    const authNum = pick(d, "AuthNum", "OKNum", "AuthCode");
    const declined = !res.mock && (!authNum || /סירוב|נדח|declin|fail/i.test(res.message ?? ""));
    if (declined) {
      throw new ApiError(res.message ? `החיוב נדחה: ${res.message}` : "החיוב נדחה", 402);
    }

    const transaction = await prisma.transaction.create({
      data: {
        obligationId: oblId,
        contactId: obligation.contactId,
        source: "api",
        kesherNumTransaction: numTransaction ?? null,
        uniqNum,
        amount: chargeAmount,
        currency: 1,
        transactionDate: new Date(),
        transactionType: "debit",
        chargeOptionType: "credit",
        statusCode: 4,
        statusText: res.mock ? "MOCK" : "עבר בהצלחה",
        cardLast4: card.last4,
        cardExpiry: card.expiry,
        authNum,
        kind: obligation.kind,
      },
    });

    return serialize({ ok: true, transaction, chargedAmount: chargeAmount, balanceAfter: balance - chargeAmount });
  },
  { admin: false },
);
