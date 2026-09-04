// Email sending via SMTP (the operator's own mailbox — Gmail, private host, …).
// Configured entirely through env secrets so no credentials live in the repo:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true" for 465), SMTP_USER, SMTP_PASS
//   MAIL_FROM   (optional; defaults to SMTP_USER)
//   NOTIFY_EMAIL(default recipient for reminders; defaults to SMTP_USER)
import nodemailer from "nodemailer";

export class MailConfigError extends Error {}

let cached: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new MailConfigError(
      "שליחת מייל אינה מוגדרת — יש להגדיר SMTP_HOST / SMTP_USER / SMTP_PASS ב-Vercel.",
    );
  }
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")) === "true";
  cached = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return cached;
}

/** The address reminders are sent TO (the operator). */
export function notifyRecipient(): string {
  return process.env.NOTIFY_EMAIL || process.env.SMTP_USER || "";
}

export async function sendMail(opts: {
  to?: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<void> {
  const transport = getTransport();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
  const to = opts.to || notifyRecipient();
  if (!to) throw new MailConfigError("לא הוגדר נמען (NOTIFY_EMAIL).");
  await transport.sendMail({ from, to, subject: opts.subject, text: opts.text, html: opts.html });
}

/** Verify the SMTP connection/credentials (used by a "send test" action). */
export async function verifyMail(): Promise<void> {
  await getTransport().verify();
}
