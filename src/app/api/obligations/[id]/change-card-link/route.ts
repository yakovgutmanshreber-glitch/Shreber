import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { kesher } from "@/lib/kesher/client";

function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return String(o[k]);
  return undefined;
}

// POST /api/obligations/[id]/change-card-link
// Change the card on an existing credit הוראת קבע WITHOUT a charge: create a
// replacement hok via Kesher's secure payment page. The client enters the new
// card there → Kesher tokenizes it and creates the new hok → on activation
// (webhook) the OLD hok is cancelled automatically.
export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const oldId = Number(id);
  const old = await prisma.obligation.findUnique({
    where: { id: oldId },
    include: { contact: true },
  });
  if (!old) throw new ApiError("התחייבות לא נמצאה", 404);
  if (!old.kesherObligationReference)
    throw new ApiError("החלפת כרטיס בקישור זמינה רק להוראת קבע שמנוהלת בקשר", 400);

  const settings = await prisma.kesherSettings.findFirst();
  const pageId = settings?.paymentPageId;
  const pageUrl = settings?.paymentPageUrl;
  if (!pageId || !pageUrl)
    throw new ApiError("יש להגדיר עמוד תשלום מאובטח בהגדרות (מזהה עמוד + כתובת)", 400);

  const contact = old.contact;

  // 1) A replacement PENDING obligation, tagged to cancel the old one on activation.
  const replacement = await prisma.obligation.create({
    data: {
      kind: old.kind,
      contactId: old.contactId,
      categoryId: old.categoryId,
      chargeType: "recurring",
      recurringAmount: old.recurringAmount,
      currency: old.currency,
      numPayments: old.numPayments,
      chargeDay: old.chargeDay,
      startDate: new Date(),
      status: "pending_bank_auth",
      paymentMethod: "credit",
      replacesObligationId: oldId,
      comment: `החלפת כרטיס להוראה ${old.kesherObligationReference}`,
    },
  });

  // 2) Secure-page token.
  const res = await kesher.getLinkToken({
    paymentPageId: pageId,
    total: Number(old.recurringAmount) || undefined,
    currency: 1,
    firstName: contact?.firstName,
    lastName: contact?.lastName ?? undefined,
    mail: contact?.email ?? undefined,
    tz: contact?.tz ?? undefined,
  });
  if (!res.ok) {
    await prisma.obligation.delete({ where: { id: replacement.id } }).catch(() => {});
    throw new ApiError(res.message ?? "יצירת קישור מאובטח נכשלה", 502);
  }
  const token = pick(res.data, "Token") ?? pick(res.raw, "Token");
  if (!token) {
    await prisma.obligation.delete({ where: { id: replacement.id } }).catch(() => {});
    throw new ApiError("קשר לא החזיר טוקן לעמוד התשלום", 502);
  }

  // 3) Build the hosted-page URL (addactiondata links the new hok back to us).
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL(pageUrl);
  url.searchParams.set("token", token);
  if (old.recurringAmount) url.searchParams.set("total", String(old.recurringAmount));
  url.searchParams.set("currency", "1");
  if (old.numPayments) url.searchParams.set("numpayment", String(old.numPayments));
  if (contact?.firstName) url.searchParams.set("firstname", contact.firstName);
  if (contact?.lastName) url.searchParams.set("lastname", contact.lastName);
  if (contact?.phone) url.searchParams.set("tel", contact.phone);
  if (contact?.email) url.searchParams.set("mail", contact.email);
  if (contact?.tz) url.searchParams.set("tz", contact.tz);
  url.searchParams.set("lang", "Hebrew");
  url.searchParams.set("successurl", `${baseUrl}/payment/complete`);
  url.searchParams.set("failedurl", `${baseUrl}/payment/failed`);
  url.searchParams.set("addactiondata", `obligation:${replacement.id}`);

  return serialize({ ok: true, url: url.toString() });
});
