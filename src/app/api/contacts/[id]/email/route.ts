import { prisma } from "@/lib/prisma";
import { handler, ApiError } from "@/lib/api";
import { sendMail, MailConfigError } from "@/lib/mail";
import { z } from "zod";

const schema = z.object({
  to: z.string().trim().email("כתובת מייל לא תקינה").optional(),
  subject: z.string().trim().min(1, "נושא חובה"),
  body: z.string().trim().min(1, "תוכן ההודעה חובה"),
});

// POST /api/contacts/[id]/email — send an email to the contact (from the
// operator's own SMTP mailbox). User-initiated: the operator composes and sends.
export const POST = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const contact = await prisma.contact.findUnique({ where: { id: Number(id) } });
  if (!contact) throw new ApiError("איש קשר לא נמצא", 404);

  const { to, subject, body } = schema.parse(await req.json());
  const recipient = to || contact.email;
  if (!recipient) throw new ApiError("יש להזין כתובת מייל לנמען", 400);
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b;white-space:pre-wrap">${escapeHtml(
    body,
  )}</div>`;
  try {
    await sendMail({ to: recipient, subject, text: body, html });
  } catch (e) {
    if (e instanceof MailConfigError) throw new ApiError(e.message, 400);
    throw e;
  }
  return { ok: true, to: recipient };
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
