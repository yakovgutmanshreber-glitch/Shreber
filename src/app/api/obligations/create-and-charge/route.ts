import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { obligationSchema } from "@/lib/schemas";
import { kesher } from "@/lib/kesher/client";
import { z } from "zod";

// Extra payment fields (a saved card id OR raw card details to tokenize once).
const chargeSchema = obligationSchema.extend({
  useCardId: z.coerce.number().int().positive().optional().nullable(),
  // New-card details — sent to Kesher to tokenize; NEVER stored raw.
  cardNumber: z.string().trim().optional(),
  cardExpiry: z.string().trim().optional(), // MMYY
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

// POST /api/obligations/create-and-charge
// Creates a credit-card obligation and performs the first Kesher charge.
// Non-credit obligations should use the plain POST /api/obligations instead.
export const POST = handler(async (req) => {
  const body = await req.json();
  const input = chargeSchema.parse(body);

  if (input.paymentMethod !== "credit") {
    throw new ApiError("מסלול זה מיועד לחיוב באשראי בלבד", 400);
  }

  // --- resolve the payment token -------------------------------------------
  let token: string | undefined;
  let savedCardExpiry: string | undefined; // token charges still need the expiry
  let cardId: number | null = input.useCardId ?? null;
  let newCard = false;

  if (cardId) {
    const card = await prisma.creditCard.findUnique({ where: { id: cardId } });
    if (!card) throw new ApiError("כרטיס לא נמצא", 404);
    token = card.token;
    savedCardExpiry = card.expiry ?? undefined;
  } else if (input.cardNumber) {
    newCard = true; // will tokenize on this first charge
  } else {
    throw new ApiError("יש לבחור כרטיס שמור או להזין פרטי כרטיס חדש", 400);
  }

  // --- amount to send to Kesher --------------------------------------------
  // installments: Total = the full amount, split into numPayments.
  // recurring:    Total = the per-period (monthly) amount. Kesher owns the hok.
  const chargeAmount = Number(input.recurringAmount);
  const isRecurring = input.chargeType === "recurring";
  const { useCardId, cardNumber, cardExpiry, cvv, cardHolder, cardBrand, saveCard, ...oblData } = input;

  // Customer details so the transaction isn't anonymous in Kesher.
  const contact = input.contactId
    ? await prisma.contact.findUnique({ where: { id: input.contactId } })
    : null;

  // --- charge via Kesher FIRST (so a failure never leaves a dangling row) ---
  const uniqNum = `C${Date.now()}${Math.floor(Math.random() * 100)}`.slice(0, 19);
  let res;
  try {
    res = await kesher.sendTransaction({
      amount: chargeAmount,
      uniqNum,
      token,
      cardNumber: newCard ? cardNumber : undefined,
      cardExpiry: newCard ? cardExpiry : savedCardExpiry,
      cvv: newCard ? cvv : undefined,
      // recurring (הוראת קבע): CreditType 10 — Kesher creates the hok and charges
      //   the monthly amount itself every period (numPayments = months, 9999=ongoing).
      // installments: split the total into numPayments.
      // one-time: a single charge.
      creditType: isRecurring ? 10 : undefined,
      numPayments:
        isRecurring || input.chargeType === "installments" ? input.numPayments : 1,
      startDate: isRecurring ? input.startDate : undefined,
      comment: input.comment ?? undefined,
      tz: contact?.tz ?? undefined,
      firstName: contact?.firstName ?? cardHolder,
      lastName: contact?.lastName ?? undefined,
      phone: contact?.phone ?? undefined,
      phone2: contact?.phone2 ?? undefined,
      mail: contact?.email ?? undefined,
      address: contact?.address ?? undefined,
      city: contact?.city ?? undefined,
    });
  } catch (e) {
    // Network / TLS / connectivity failure — the request never reached Kesher,
    // so nothing was charged and nothing is persisted.
    const msg = e instanceof Error ? e.message : "שגיאת רשת";
    throw new ApiError(`החיבור לקשר נכשל (${msg}). לא בוצע חיוב — נסה שוב.`, 502);
  }

  if (!res.ok) {
    // Card problem (declined etc.) — reached Kesher but rejected. Nothing persisted.
    throw new ApiError(res.message ?? "החיוב נדחה על ידי חברת האשראי", 402);
  }

  const d = res.data ?? res.raw;
  const numTransaction = pick(d, "NumTransaction") ?? (res.mock ? uniqNum : undefined);
  const oblRef = pick(d, "ObligationReference");
  const returnedToken = pick(d, "Token");
  const authNum = pick(d, "AuthNum", "OKNum", "AuthCode");

  // Kesher returns Status:true even for DECLINES ("סירוב") — a real approval has
  // an authorization number. No auth (or an explicit decline) = the charge failed.
  const hokCreated = isRecurring && Boolean(oblRef);
  const explicitDecline = /סירוב|נדח|declin|fail/i.test(res.message ?? "");
  const chargeApproved = Boolean(res.mock) || (Boolean(authNum) && !explicitDecline);

  // For a הוראת קבע the hok is created in Kesher even if the FIRST charge is
  // declined — Kesher owns it now, so we still create the obligation and RECORD
  // the declined first charge (so the סירוב is visible). For one-time /
  // installments a decline means nothing was set up: surface an error, persist nothing.
  if (!hokCreated && !chargeApproved) {
    throw new ApiError(
      res.message ? `החיוב נדחה: ${res.message}` : "החיוב נדחה על ידי חברת האשראי",
      402,
    );
  }

  // A first charge was ATTEMPTED if Kesher returned a transaction id or an
  // explicit decline. A future-dated hok has neither (nothing charged yet) —
  // that first transaction will arrive later via the webhook.
  const firstChargeAttempted = chargeApproved || Boolean(numTransaction) || explicitDecline;

  // --- charge succeeded: save a new card from the returned token -----------
  if (newCard && saveCard && returnedToken && input.contactId) {
    const last4 = cardNumber?.replace(/\D/g, "").slice(-4);
    const count = await prisma.creditCard.count({ where: { contactId: input.contactId } });
    const card = await prisma.creditCard.create({
      data: {
        contactId: input.contactId,
        token: returnedToken,
        last4,
        expiry: cardExpiry,
        brand: cardBrand,
        holderName: cardHolder,
        isDefault: count === 0,
      },
    });
    cardId = card.id;
  }

  // --- create the obligation + record the first transaction ----------------
  // A one-time charge is complete once it succeeds; recurring/installments stay active.
  const finalStatus = input.chargeType === "onetime" ? "finished" : "active";
  const updated = await prisma.obligation.create({
    data: {
      ...oblData,
      creditCardId: cardId,
      status: finalStatus,
      kesherObligationReference: oblRef ?? undefined,
    },
    include: { category: true, contact: true, creditCard: true },
  });
  const obligation = updated;

  // Record the first transaction whenever a charge was ATTEMPTED — approved OR
  // declined — so the outcome (עבר בהצלחה / סירוב) is visible. A future-dated hok
  // hasn't charged yet, so nothing is recorded; the webhook delivers it later.
  const transaction = firstChargeAttempted
    ? await prisma.transaction.create({
        data: {
          obligationId: obligation.id,
          contactId: input.contactId ?? null,
          source: "api",
          kesherNumTransaction: numTransaction ?? null,
          uniqNum,
          amount: chargeAmount,
          currency: 1,
          transactionDate: new Date(),
          transactionType: "debit",
          chargeOptionType: "credit",
          // Approved => Kesher's "settled" status (4 = עבר בהצלחה). Declined =>
          // no settled code; keep Kesher's own wording ("סירוב") in statusText so
          // the badge shows it in red. (res.code is the request-envelope code, not
          // a transaction status — never store it here.)
          statusCode: chargeApproved ? 4 : null,
          statusText: chargeApproved
            ? res.mock
              ? "MOCK"
              : "עבר בהצלחה"
            : res.message ?? "סירוב",
          cardLast4: cardNumber?.replace(/\D/g, "").slice(-4),
          cardExpiry: cardExpiry,
          authNum: pick(d, "AuthNum", "OKNum", "AuthCode"),
          comment: input.comment ?? null,
          kind: input.kind,
        },
      })
    : null;

  return serialize({ ok: true, mock: res.mock ?? false, obligation: updated, transaction });
}, { admin: false });
