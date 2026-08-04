import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { obligationSchema } from "@/lib/schemas";
import { kesher, KesherConfigError, looksLikeCardNumber } from "@/lib/kesher/client";
import { KESHER_OBLIGATION_STATUS_CODE } from "@/lib/constants";

async function getId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

export const GET = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  const obligation = await prisma.obligation.findUnique({
    where: { id },
    include: {
      category: true,
      contact: true,
      transactions: { orderBy: { transactionDate: "desc" } },
    },
  });
  if (!obligation) throw new ApiError("התחייבות לא נמצאה", 404);
  return serialize(obligation);
});

// PATCH edits an obligation AND mirrors the change into Kesher when Kesher owns
// the hok (it has a kesherObligationReference). We push to Kesher FIRST — if that
// fails we do NOT touch the local row, so the two sides never drift apart.
export const PATCH = handler(async (req, ctx) => {
  const id = await getId(ctx);
  const body = await req.json();
  const data = obligationSchema.partial().parse(body);

  const existing = await prisma.obligation.findUnique({
    where: { id },
    include: { creditCard: true },
  });
  if (!existing) throw new ApiError("התחייבות לא נמצאה", 404);

  // A hok Kesher already closed (finished/cancelled) can't be modified there, so
  // edits to it are saved LOCALLY only — this lets the user correct the record
  // (e.g. set status back to פעיל) without hitting a Kesher rejection.
  const CLOSED_KESHER_STATUSES = ["finished", "cancelled", "bank_auth_cancelled", "payment_method_cancelled"];
  const ref = existing.kesherObligationReference;
  if (ref && !CLOSED_KESHER_STATUSES.includes(existing.status)) {
    // --- detect which Kesher-relevant fields changed ----------------------
    const targetStatus = data.status ?? existing.status;
    const statusChanged = data.status !== undefined && data.status !== existing.status;
    const amountChanged =
      data.recurringAmount !== undefined &&
      Number(data.recurringAmount) !== Number(existing.recurringAmount);
    const dayChanged =
      data.chargeDay !== undefined && data.chargeDay !== existing.chargeDay;
    const dateChanged =
      data.startDate !== undefined &&
      new Date(data.startDate).getTime() !== new Date(existing.startDate).getTime();
    const numPaymentsChanged =
      data.numPayments !== undefined &&
      Number(data.numPayments) !== Number(existing.numPayments);
    const cardChanged =
      data.creditCardId !== undefined && data.creditCardId !== existing.creditCardId;

    // 1) amount / day / start-date / num-payments / status -> UpdateObligation.
    // Send ONLY the fields that changed; leave the rest null (= unchanged) — e.g.
    // re-sending an old StartDate is rejected by Kesher ("תאריך שגוי").
    if (statusChanged || amountChanged || dayChanged || dateChanged || numPaymentsChanged) {
      const res = await kesher.updateObligation({
        obligationReference: ref,
        sum: amountChanged ? Number(data.recurringAmount) : undefined,
        chargeDay: dayChanged ? (data.chargeDay ?? undefined) : undefined,
        startDate: dateChanged ? String(data.startDate) : undefined,
        numPayments: numPaymentsChanged ? Number(data.numPayments) : undefined,
        status: statusChanged
          ? String(KESHER_OBLIGATION_STATUS_CODE[targetStatus] ?? 1)
          : undefined,
      });
      if (!res.ok) {
        throw new ApiError(
          `עדכון ההוראה בקשר נכשל: ${res.message ?? "שגיאה"}. השינוי לא נשמר כדי לשמור על סנכרון.`,
          502,
        );
      }
    }

    // 2) credit-card swap -> ChangeChargeOptionForObligation (REST, Bearer token).
    if (cardChanged && data.creditCardId) {
      const card = await prisma.creditCard.findUnique({ where: { id: data.creditCardId } });
      if (!card) throw new ApiError("כרטיס לא נמצא", 404);
      if (looksLikeCardNumber(card.token)) {
        throw new ApiError(
          "לכרטיס זה נשמר מספר כרטיס במקום טוקן תקין של קשר, ולכן לא ניתן להחליף אליו. יש למחוק אותו ולהוסיף מחדש דרך 'כרטיסי אשראי' (הכרטיס יאומת ויקבל טוקן).",
          400,
        );
      }
      try {
        const res = await kesher.changeChargeOptionForObligation({
          obligationReference: ref,
          paymentMethod: "credit",
          token: card.token,
          cardExpiry: card.expiry ?? undefined,
          name: card.holderName ?? undefined,
        });
        if (!res.ok) {
          throw new ApiError(
            `החלפת הכרטיס בקשר נכשלה: ${res.message ?? "שגיאה"}. השינוי לא נשמר.`,
            502,
          );
        }
      } catch (e) {
        if (e instanceof KesherConfigError) {
          throw new ApiError(
            "החלפת כרטיס בהוראת קבע דורשת טוקן API של קשר (KESHER_API_TOKEN) שעדיין לא הוגדר.",
            400,
          );
        }
        throw e;
      }
    }
  }

  const obligation = await prisma.obligation.update({
    where: { id },
    data,
    include: { category: true, contact: true },
  });
  return serialize(obligation);
});

// DELETE removes the local record. If Kesher owns the hok, cancel it there FIRST
// (status 3) so it stops charging — never leave an orphaned live hok behind.
export const DELETE = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  const existing = await prisma.obligation.findUnique({ where: { id } });
  if (!existing) return { ok: true };

  const ref = existing.kesherObligationReference;
  if (ref && !["cancelled", "finished"].includes(existing.status)) {
    // Cancel = send only status 3; leave every other field null (unchanged).
    const res = await kesher.updateObligation({
      obligationReference: ref,
      status: String(KESHER_OBLIGATION_STATUS_CODE.cancelled), // 3
    });
    if (!res.ok) {
      throw new ApiError(
        `ביטול ההוראה בקשר נכשל: ${res.message ?? "שגיאה"}. ההתחייבות לא נמחקה כדי למנוע חיוב ממשיך.`,
        502,
      );
    }
  }

  await prisma.obligation.delete({ where: { id } });
  return { ok: true };
});
