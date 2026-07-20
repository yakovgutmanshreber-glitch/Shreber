import { handler, ApiError, serialize } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { kesher } from "@/lib/kesher/client";
import { z } from "zod";

const schema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.coerce.number().int().default(1),
  // payment credential: a saved card id, a raw token, OR full card details
  cardId: z.coerce.number().int().positive().optional().nullable(),
  token: z.string().trim().optional(),
  cardNumber: z.string().trim().optional(),
  cardExpiry: z.string().trim().optional(), // MMYY
  cvv: z.string().trim().optional(),
  tz: z.string().trim().optional(),
  numPayments: z.coerce.number().int().optional(),
  comment: z.string().trim().optional(),
  obligationId: z.coerce.number().int().positive().optional().nullable(),
  contactId: z.coerce.number().int().positive().optional().nullable(),
  kind: z.enum(["income", "expense"]).default("income"),
});

function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return String(o[k]);
  }
  return undefined;
}

// POST /api/kesher/charge — charge a transaction via Kesher SendTransaction (admin).
export const POST = handler(async (req) => {
  const body = await req.json();
  const input = schema.parse(body);

  // Resolve a saved card id → its token (kept server-side).
  let token = input.token;
  let cardExpiry = input.cardExpiry;
  let contactId = input.contactId ?? null;
  if (input.cardId) {
    const card = await prisma.creditCard.findUnique({ where: { id: input.cardId } });
    if (!card) throw new ApiError("כרטיס לא נמצא", 404);
    token = card.token;
    cardExpiry = cardExpiry ?? card.expiry ?? undefined;
    contactId = contactId ?? card.contactId;
  }

  if (!token && !input.cardNumber) {
    throw new ApiError("נדרש טוקן שמור או פרטי כרטיס אשראי לביצוע חיוב", 400);
  }

  // Inherit kind from the obligation when linked.
  let kind = input.kind;
  if (input.obligationId) {
    const obl = await prisma.obligation.findUnique({ where: { id: input.obligationId } });
    if (obl) kind = obl.kind as "income" | "expense";
  }

  // Customer details so the transaction isn't anonymous in Kesher.
  const contact = contactId
    ? await prisma.contact.findUnique({ where: { id: contactId } })
    : null;

  // Our unique id sent to Kesher (max 19 chars) — used for idempotency/matching.
  const uniqNum = `C${Date.now()}${Math.floor(Math.random() * 100)}`.slice(0, 19);

  const res = await kesher.sendTransaction({
    amount: input.amount,
    currency: input.currency as 1 | 2 | 826 | 978,
    uniqNum,
    token,
    cardNumber: input.cardNumber,
    cardExpiry,
    cvv: input.cvv,
    numPayments: input.numPayments,
    comment: input.comment,
    tz: input.tz ?? contact?.tz ?? undefined,
    firstName: contact?.firstName ?? undefined,
    lastName: contact?.lastName ?? undefined,
    phone: contact?.phone ?? undefined,
    phone2: contact?.phone2 ?? undefined,
    mail: contact?.email ?? undefined,
    address: contact?.address ?? undefined,
    city: contact?.city ?? undefined,
  });

  if (!res.ok) {
    throw new ApiError(res.message ?? "החיוב נכשל בקשר", 502);
  }

  // Record the resulting transaction. Response field names vary; fall back to input.
  const d = res.data ?? res.raw;
  const numTransaction = pick(d, "NumTransaction") ?? (res.mock ? uniqNum : null);
  const authNum = pick(d, "AuthNum", "OKNum", "AuthCode");

  // Kesher returns Status:true even for declines ("סירוב") — require an auth number.
  if (!res.mock && (!authNum || /סירוב|נדח|declin|fail/i.test(res.message ?? ""))) {
    throw new ApiError(
      res.message ? `החיוב נדחה: ${res.message}` : "החיוב נדחה על ידי חברת האשראי",
      402,
    );
  }
  const transaction = await prisma.transaction.create({
    data: {
      obligationId: input.obligationId ?? null,
      contactId,
      source: "api",
      kesherNumTransaction: numTransaction,
      uniqNum,
      amount: input.amount,
      currency: input.currency,
      transactionDate: new Date(),
      transactionType: "debit",
      chargeOptionType: "credit",
      statusCode: res.code !== undefined ? Number(res.code) : 4,
      statusText: res.message ?? (res.mock ? "MOCK" : "עבר בהצלחה"),
      cardLast4: input.cardNumber ? input.cardNumber.replace(/\D/g, "").slice(-4) : undefined,
      cardExpiry: input.cardExpiry,
      authNum,
      comment: input.comment,
      kind,
    },
  });

  return serialize({ ok: true, mock: res.mock ?? false, transaction, kesher: res.data });
}, { admin: true });
