import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { obligationSchema } from "@/lib/schemas";
import { kesher } from "@/lib/kesher/client";
import { convertToIls } from "@/lib/currency";
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
  // Future charge date → Kesher holds the charge and executes it on that date (its own
  // UI does this via the "תאריך חיוב" field). We just send the date; nothing is charged
  // now, so a future charge legitimately comes back with no authorization number.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startAt = input.startDate ? new Date(input.startDate) : null;
  const isFuture = Boolean(startAt && !Number.isNaN(startAt.getTime()) && startAt.getTime() > today.getTime());
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
      currency: input.currency ?? 1, // charge in the obligation's own currency
      projectNumber: input.projectNumber || undefined, // Kesher project (פרויקט)
      uniqNum,
      token,
      cardNumber: newCard ? cardNumber : undefined,
      cardExpiry: newCard ? cardExpiry : savedCardExpiry,
      cvv: newCard ? cvv : undefined,
      // recurring (הוראת קבע): CreditType 10 — Kesher creates the hok and charges
      //   the monthly amount itself every period (numPayments = months, 9999=ongoing).
      //   A future startDate (TransactionDate) defers the first charge to that date.
      // installments: split the total into numPayments.
      // one-time: a single immediate charge.
      creditType: isRecurring ? 10 : undefined,
      numPayments:
        isRecurring || input.chargeType === "installments" ? input.numPayments : 1,
      // Always send the date so Kesher schedules the charge for it (future = held).
      startDate: input.startDate,
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
  // A FUTURE-dated charge is accepted but not executed now (Kesher holds it for the
  // date), so it legitimately returns no authorization number — that's success, not a
  // decline. An explicit card decline ("סירוב") is still a failure.
  const futureScheduled = isFuture && !explicitDecline;

  // For a הוראת קבע the hok is created in Kesher even if the FIRST charge is
  // declined — Kesher owns it now, so we still create the obligation and RECORD
  // the declined first charge (so the סירוב is visible). For one-time /
  // installments a decline means nothing was set up: surface an error, persist nothing.
  if (!hokCreated && !chargeApproved && !futureScheduled) {
    throw new ApiError(
      res.message ? `החיוב נדחה: ${res.message}` : "החיוב נדחה על ידי חברת האשראי",
      402,
    );
  }

  // A first charge was ATTEMPTED if Kesher returned a transaction id or an explicit
  // decline. A future-dated charge records a SCHEDULED (pending) transaction dated to
  // the charge date; Kesher executes it then and the webhook updates the status.
  const firstChargeAttempted =
    chargeApproved || Boolean(numTransaction) || explicitDecline || futureScheduled;

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
  // A FUTURE-dated one-time hasn't charged yet, so it stays active until the charge runs.
  const finalStatus = input.chargeType === "onetime" && !isFuture ? "finished" : "active";
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
  const txFx = firstChargeAttempted
    ? await convertToIls(chargeAmount, input.currency ?? 1)
    : { exchangeRate: null, amountIls: null };
  const transaction = firstChargeAttempted
    ? await prisma.transaction.create({
        data: {
          obligationId: obligation.id,
          contactId: input.contactId ?? null,
          source: "api",
          kesherNumTransaction: numTransaction ?? null,
          uniqNum,
          amount: chargeAmount,
          currency: input.currency ?? 1,
          exchangeRate: txFx.exchangeRate,
          amountIls: txFx.amountIls,
          // Future charge: date the record to the scheduled charge date. Else: now.
          transactionDate: futureScheduled && startAt ? startAt : new Date(),
          transactionType: "debit",
          chargeOptionType: "credit",
          // Approved => Kesher's "settled" status (4 = עבר בהצלחה). Future-scheduled =>
          // pending (no settled code yet), shown as "מתוזמן לחיוב". Declined => keep
          // Kesher's own wording ("סירוב") so the badge shows it in red. (res.code is
          // the request-envelope code, not a transaction status — never store it here.)
          statusCode: chargeApproved ? 4 : null,
          statusText: chargeApproved
            ? res.mock
              ? "MOCK"
              : "עבר בהצלחה"
            : futureScheduled
              ? "מתוזמן לחיוב"
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
