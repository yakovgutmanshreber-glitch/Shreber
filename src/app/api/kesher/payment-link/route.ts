import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { kesher } from "@/lib/kesher/client";
import { z } from "zod";

const schema = z.object({
  contactId: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().min(0).default(0),
  currency: z.coerce.number().int().default(1),
  numPayments: z.coerce.number().int().min(1).optional(),
});

function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return String(o[k]);
  return undefined;
}

// POST /api/kesher/payment-link
// Returns a URL to Kesher's secure hosted page where the payer enters their card.
// The card number never touches our server; Kesher returns a token via callback.
export const POST = handler(async (req) => {
  const body = await req.json();
  const input = schema.parse(body);

  const settings = await prisma.kesherSettings.findFirst();
  const pageId = settings?.paymentPageId;
  const pageUrl = settings?.paymentPageUrl;
  if (!pageId) throw new ApiError("לא הוגדר מזהה עמוד תשלום (PaymentPageId) בהגדרות", 400);
  if (!pageUrl) throw new ApiError("לא הוגדרה כתובת עמוד התשלום (Payment Page URL) בהגדרות", 400);

  const contact = input.contactId
    ? await prisma.contact.findUnique({ where: { id: input.contactId } })
    : null;

  // 1) Ask Kesher for a temporary page token.
  const res = await kesher.getLinkToken({
    paymentPageId: pageId,
    total: input.amount || undefined,
    currency: input.currency as 1 | 2 | 826 | 978,
    firstName: contact?.firstName,
    lastName: contact?.lastName ?? undefined,
    mail: contact?.email ?? undefined,
    tz: contact?.tz ?? undefined,
  });
  if (!res.ok) throw new ApiError(res.message ?? "יצירת קישור התשלום נכשלה", 502);

  const token = pick(res.data, "Token") ?? pick(res.raw, "Token");
  if (!token) throw new ApiError("קשר לא החזיר טוקן עמוד תשלום", 502);

  // 2) Build the hosted-page URL. `addactiondata` carries our contactId so the
  //    callback/webhook can link the returned card token to the right contact.
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL(pageUrl);
  url.searchParams.set("id", String(pageId));
  url.searchParams.set("token", token);
  if (input.amount) url.searchParams.set("total", String(input.amount));
  url.searchParams.set("currency", String(input.currency));
  if (input.numPayments) url.searchParams.set("numpayment", String(input.numPayments));
  if (contact?.firstName) url.searchParams.set("firstname", contact.firstName);
  if (contact?.lastName) url.searchParams.set("lastname", contact.lastName);
  if (contact?.phone) url.searchParams.set("tel", contact.phone);
  if (contact?.email) url.searchParams.set("mail", contact.email);
  if (contact?.tz) url.searchParams.set("tz", contact.tz);
  url.searchParams.set("lang", "Hebrew");
  url.searchParams.set("successurl", `${baseUrl}/payment/complete`);
  url.searchParams.set("failedurl", `${baseUrl}/payment/failed`);
  if (input.contactId) url.searchParams.set("addactiondata", `contact:${input.contactId}`);

  return serialize({ ok: true, url: url.toString(), token });
}, { admin: false });
