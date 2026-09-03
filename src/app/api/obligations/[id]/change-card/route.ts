import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { kesher, KesherConfigError } from "@/lib/kesher/client";
import { cardEntrySchema } from "@/lib/schemas";

// POST /api/obligations/[id]/change-card
// Change the card on a Kesher credit הוראת קבע ENTIRELY IN-SYSTEM: the operator
// types the new card → GetToken tokenizes it (no charge) → we save it on the
// contact and swap the hok's card to the new token.
export const POST = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const obl = await prisma.obligation.findUnique({ where: { id: Number(id) } });
  if (!obl) throw new ApiError("התחייבות לא נמצאה", 404);
  if (!obl.kesherObligationReference)
    throw new ApiError("החלפת כרטיס זמינה רק להוראת קבע שמנוהלת בקשר", 400);

  const card = cardEntrySchema.parse(await req.json());

  // 1) Tokenize the new card (GetToken — no charge).
  const tok = await kesher.tokenizeCard({ cardNumber: card.cardNumber, cardExpiry: card.expiry });
  if (!tok.ok || !tok.token) throw new ApiError(tok.message ?? "אסימון הכרטיס בקשר נכשל", 502);

  // 2) Save the card (token only — never the PAN) on the contact.
  const savedCard = obl.contactId
    ? await prisma.creditCard.create({
        data: {
          contactId: obl.contactId,
          token: tok.token,
          last4: card.cardNumber.slice(-4),
          expiry: card.expiry,
          holderName: card.holderName ?? null,
          isDefault: card.isDefault ?? false,
        },
      })
    : null;

  // 3) Swap the hok's card in Kesher (ChangeChargeOptionForObligation, Bearer).
  try {
    const res = await kesher.changeChargeOptionForObligation({
      obligationReference: obl.kesherObligationReference,
      paymentMethod: "credit",
      token: tok.token,
      cardExpiry: card.expiry,
      name: card.holderName ?? undefined,
    });
    if (!res.ok) {
      const detail = [res.message, res.code != null ? `קוד ${res.code}` : null]
        .filter(Boolean)
        .join(" · ");
      const raw = res.raw ? ` | ${JSON.stringify(res.raw).slice(0, 300)}` : "";
      throw new ApiError(`החלפת הכרטיס בקשר נכשלה: ${detail || "שגיאה"}${raw}`, 502);
    }
  } catch (e) {
    if (e instanceof KesherConfigError) {
      throw new ApiError(
        "הכרטיס אומת ונשמר, אך החלפתו בהוראת הקבע דורשת טוקן API של קשר (KESHER_API_TOKEN) שעדיין לא הוגדר. יש להנפיקו בפאנל של קשר ולהגדירו ב-Vercel.",
        400,
      );
    }
    throw e;
  }

  if (savedCard) {
    await prisma.obligation.update({ where: { id: obl.id }, data: { creditCardId: savedCard.id } });
  }
  return serialize({ ok: true, last4: card.cardNumber.slice(-4) });
});
