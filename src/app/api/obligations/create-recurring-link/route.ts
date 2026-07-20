import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { obligationSchema } from "@/lib/schemas";
import { kesher } from "@/lib/kesher/client";

function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return String(o[k]);
  return undefined;
}

// POST /api/obligations/create-recurring-link
// Case A (credit הוראת קבע): create a PENDING obligation and return a Kesher
// standing-order payment-page link. The donor enters the card once on Kesher's
// secure page → Kesher creates & OWNS the hok and returns its ObligationReference
// (arrives via the webhook with our addactiondata). From then on Kesher charges
// monthly and each payment streams into this obligation via the webhook.
export const POST = handler(async (req) => {
  const body = await req.json();
  const data = obligationSchema.parse(body);

  if (data.paymentMethod !== "credit") {
    throw new ApiError("מסלול זה מיועד להוראת קבע באשראי בלבד", 400);
  }

  const settings = await prisma.kesherSettings.findFirst();
  const pageId = settings?.paymentPageId;
  const pageUrl = settings?.paymentPageUrl;
  if (!pageId || !pageUrl) {
    throw new ApiError(
      "יש להגדיר תחילה בהגדרות עמוד תשלום להוראת קבע (מזהה עמוד + כתובת) שהוקם בפאנל של קשר",
      400,
    );
  }

  const contact = data.contactId
    ? await prisma.contact.findUnique({ where: { id: data.contactId } })
    : null;

  // 1) Create the obligation as PENDING — it activates when Kesher returns the
  //    hok reference via the webhook.
  const obligation = await prisma.obligation.create({
    data: {
      kind: data.kind,
      contactId: data.contactId ?? null,
      categoryId: data.categoryId ?? null,
      chargeType: "recurring",
      recurringAmount: data.recurringAmount,
      numPayments: data.numPayments,
      chargeDay: data.chargeDay ?? null,
      startDate: data.startDate,
      status: "pending_bank_auth", // ממתין לאישור הלקוח בעמוד קשר
      paymentMethod: "credit",
      comment: data.comment ?? null,
    },
    include: { category: true, contact: true },
  });

  // 2) Get a page token from Kesher.
  const res = await kesher.getLinkToken({
    paymentPageId: pageId,
    total: Number(data.recurringAmount) || undefined,
    currency: 1,
    firstName: contact?.firstName,
    lastName: contact?.lastName ?? undefined,
    mail: contact?.email ?? undefined,
    tz: contact?.tz ?? undefined,
  });
  if (!res.ok) {
    // roll back the pending obligation — the link couldn't be created
    await prisma.obligation.delete({ where: { id: obligation.id } }).catch(() => {});
    throw new ApiError(res.message ?? "יצירת קישור הוראת הקבע נכשלה", 502);
  }
  const token = pick(res.data, "Token") ?? pick(res.raw, "Token");
  if (!token) {
    await prisma.obligation.delete({ where: { id: obligation.id } }).catch(() => {});
    throw new ApiError("קשר לא החזיר טוקן לעמוד התשלום", 502);
  }

  // 3) Build the hosted-page URL. addactiondata carries OUR obligation id so the
  //    callback/webhook links Kesher's new hok reference back to this obligation.
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL(pageUrl);
  // The page id is already in the URL path (…/paymentPage/327409); the token +
  // our addactiondata are what carry the session and the obligation link.
  url.searchParams.set("token", token);
  if (data.recurringAmount) url.searchParams.set("total", String(data.recurringAmount));
  url.searchParams.set("currency", "1");
  if (data.numPayments) url.searchParams.set("numpayment", String(data.numPayments));
  if (contact?.firstName) url.searchParams.set("firstname", contact.firstName);
  if (contact?.lastName) url.searchParams.set("lastname", contact.lastName);
  if (contact?.phone) url.searchParams.set("tel", contact.phone);
  if (contact?.email) url.searchParams.set("mail", contact.email);
  if (contact?.tz) url.searchParams.set("tz", contact.tz);
  url.searchParams.set("lang", "Hebrew");
  url.searchParams.set("successurl", `${baseUrl}/payment/complete`);
  url.searchParams.set("failedurl", `${baseUrl}/payment/failed`);
  url.searchParams.set("addactiondata", `obligation:${obligation.id}`);

  return serialize({ ok: true, obligation, url: url.toString() });
});
