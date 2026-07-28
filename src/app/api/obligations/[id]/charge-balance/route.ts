import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { kesher, looksLikeCardNumber } from "@/lib/kesher/client";
import { z } from "zod";

const schema = z.object({
  cardId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().positive().optional(), // default = remaining balance
  // OR raw card details (tokenized on this charge; never stored raw):
  cardNumber: z.string().trim().optional(),
  cardExpiry: z.string().trim().optional(),
  cvv: z.string().trim().optional(),
  cardHolder: z.string().trim().optional(),
  cardBrand: z.string().trim().optional(),
  saveCard: z.boolean().optional().default(true),
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
    const input = schema.parse(await req.json());

    const obligation = await prisma.obligation.findUnique({
      where: { id: oblId },
      include: { contact: true, transactions: { select: { amount: true, statusCode: true } } },
    });
    if (!obligation) throw new ApiError("התחייבות לא נמצאה", 404);

    const paid = obligation.transactions
      .filter((t) => t.statusCode != null && TX_SUCCESS.has(t.statusCode))
      .reduce((s, t) => s + Number(t.amount), 0);
    const balance = Number(obligation.recurringAmount) - paid;
    const chargeAmount = input.amount ?? balance;
    if (chargeAmount <= 0) throw new ApiError("אין יתרה לחיוב", 400);

    // Resolve the card: a saved token OR raw details (tokenized on this charge).
    let token: string | undefined;
    let savedExpiry: string | undefined;
    let savedLast4: string | undefined;
    const newCard = !input.cardId && Boolean(input.cardNumber);
    if (input.cardId) {
      const card = await prisma.creditCard.findUnique({ where: { id: input.cardId } });
      if (!card) throw new ApiError("כרטיס לא נמצא", 404);
      if (looksLikeCardNumber(card.token)) {
        throw new ApiError(
          "לכרטיס זה אין טוקן תקין בקשר. יש למחוק ולהוסיף אותו מחדש דרך 'כרטיסי אשראי'.",
          400,
        );
      }
      token = card.token;
      savedExpiry = card.expiry ?? undefined;
      savedLast4 = card.last4 ?? undefined;
    } else if (!input.cardNumber) {
      throw new ApiError("יש לבחור כרטיס שמור או להזין כרטיס חדש", 400);
    }

    const c = obligation.contact;
    const uniqNum = `B${Date.now()}${Math.floor(Math.random() * 100)}`.slice(0, 19);
    let res;
    try {
      res = await kesher.sendTransaction({
        amount: chargeAmount,
        uniqNum,
        token,
        cardNumber: newCard ? input.cardNumber : undefined,
        cardExpiry: newCard ? input.cardExpiry : savedExpiry,
        cvv: newCard ? input.cvv : undefined,
        comment: `חיוב להתחייבות ${oblId}`,
        tz: c?.tz ?? undefined,
        firstName: c?.firstName ?? input.cardHolder,
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
    const returnedToken = pick(d, "Token");
    const declined = !res.mock && (!authNum || /סירוב|נדח|declin|fail/i.test(res.message ?? ""));
    if (declined) {
      throw new ApiError(res.message ? `החיוב נדחה: ${res.message}` : "החיוב נדחה", 402);
    }

    // Save a new card from the returned token.
    const newLast4 = input.cardNumber?.replace(/\D/g, "").slice(-4);
    if (newCard && input.saveCard && returnedToken && obligation.contactId) {
      const count = await prisma.creditCard.count({ where: { contactId: obligation.contactId } });
      await prisma.creditCard.create({
        data: {
          contactId: obligation.contactId,
          token: returnedToken,
          last4: newLast4,
          expiry: input.cardExpiry,
          brand: input.cardBrand,
          holderName: input.cardHolder,
          isDefault: count === 0,
        },
      });
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
        cardLast4: newCard ? newLast4 : savedLast4,
        cardExpiry: newCard ? input.cardExpiry : savedExpiry,
        authNum,
        kind: obligation.kind,
      },
    });

    return serialize({ ok: true, transaction, chargedAmount: chargeAmount, balanceAfter: balance - chargeAmount });
  },
  { admin: false },
);
