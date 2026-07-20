import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { creditCardSchema, cardEntrySchema } from "@/lib/schemas";
import { kesher } from "@/lib/kesher/client";

/** Best-effort card brand from the number's BIN — display only. */
function brandFromNumber(num: string): string | null {
  if (/^4/.test(num)) return "ויזה";
  if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) return "מאסטרקארד";
  if (/^3[47]/.test(num)) return "אמריקן אקספרס";
  if (/^3(0|6|8)/.test(num)) return "דיינרס";
  return null;
}

async function getContactId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

export const GET = handler(async (_req, ctx) => {
  const contactId = await getContactId(ctx);
  const cards = await prisma.creditCard.findMany({
    where: { contactId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return serialize(cards);
});

export const POST = handler(async (req, ctx) => {
  const contactId = await getContactId(ctx);
  const body = await req.json();

  // Two modes: card details typed once (→ Kesher verifies + tokenizes; details
  // are NOT stored), or a ready-made token (legacy/programmatic path).
  let data: {
    token: string;
    last4: string | null;
    expiry: string | null;
    brand: string | null;
    holderName: string | null;
    isDefault: boolean;
  };
  if (body?.cardNumber) {
    const input = cardEntrySchema.parse(body);
    const result = await kesher.tokenizeCard({
      cardNumber: input.cardNumber,
      cardExpiry: input.expiry,
      cvv: input.cvv ?? undefined,
      holderName: input.holderName ?? undefined,
    });
    if (!result.ok || !result.token) {
      throw new ApiError(result.message ?? "אימות הכרטיס מול קשר נכשל", 402);
    }
    data = {
      token: result.token,
      last4: input.cardNumber.slice(-4),
      expiry: input.expiry,
      brand: brandFromNumber(input.cardNumber),
      holderName: input.holderName,
      isDefault: input.isDefault,
    };
  } else {
    const parsed = creditCardSchema.parse(body);
    data = {
      token: parsed.token,
      last4: parsed.last4,
      expiry: parsed.expiry,
      brand: parsed.brand,
      holderName: parsed.holderName,
      isDefault: parsed.isDefault,
    };
  }

  const card = await prisma.$transaction(async (tx) => {
    // First card for a contact becomes default automatically.
    const count = await tx.creditCard.count({ where: { contactId } });
    const makeDefault = data.isDefault || count === 0;
    if (makeDefault) {
      await tx.creditCard.updateMany({ where: { contactId }, data: { isDefault: false } });
    }
    return tx.creditCard.create({ data: { ...data, contactId, isDefault: makeDefault } });
  });

  return serialize(card);
});
