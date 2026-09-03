import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { kesher } from "@/lib/kesher/client";

function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return String(o[k]);
  return undefined;
}

// POST /api/obligations/[id]/change-card
// Generate a Kesher "יצירת טוקן" (tokenization) page link for changing the card
// on a credit הוראת קבע — NO charge. The client enters card+expiry on Kesher's
// secure page; Kesher sends the token to our callback (/api/kesher/token) which
// saves the card and swaps the hok.
export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const obl = await prisma.obligation.findUnique({
    where: { id: Number(id) },
    include: { contact: true },
  });
  if (!obl) throw new ApiError("התחייבות לא נמצאה", 404);
  if (!obl.kesherObligationReference)
    throw new ApiError("החלפת כרטיס זמינה רק להוראת קבע שמנוהלת בקשר", 400);
  if (!obl.contactId) throw new ApiError("להתחייבות אין איש קשר משויך", 400);

  const settings = await prisma.kesherSettings.findFirst();
  const tokenPageUrl = settings?.tokenPageUrl;
  if (!tokenPageUrl)
    throw new ApiError(
      "יש להגדיר בהגדרות את כתובת עמוד יצירת הטוקן (דף מסוג 'יצירת טוקן' בקשר).",
      400,
    );

  // Ask Kesher to start a tokenization session for this customer + hok.
  const res = await kesher.getToken({
    customerRef: String(obl.contactId),
    obligationRef: obl.kesherObligationReference,
  });
  if (!res.ok) throw new ApiError(res.message ?? "יצירת קישור הטוקן נכשלה", 502);
  const sessionToken = pick(res.data, "String", "Token", "token") ?? pick(res.raw, "String", "Token", "token");

  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL(tokenPageUrl);
  if (sessionToken) url.searchParams.set("token", sessionToken);
  url.searchParams.set("customerRef", String(obl.contactId));
  url.searchParams.set("obligationRef", obl.kesherObligationReference);
  const c = obl.contact;
  if (c?.firstName) url.searchParams.set("firstname", c.firstName);
  if (c?.lastName) url.searchParams.set("lastname", c.lastName);
  if (c?.phone) url.searchParams.set("tel", c.phone);
  if (c?.email) url.searchParams.set("mail", c.email);
  url.searchParams.set("lang", "Hebrew");
  url.searchParams.set("successurl", `${baseUrl}/payment/complete`);
  url.searchParams.set("failedurl", `${baseUrl}/payment/failed`);

  return serialize({ ok: true, url: url.toString() });
});
