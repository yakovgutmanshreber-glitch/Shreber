// Email sending via SMTP (the operator's own mailbox — Gmail, private host, …).
// Configured entirely through env secrets so no credentials live in the repo:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true" for 465), SMTP_USER, SMTP_PASS
//   MAIL_FROM   (optional; defaults to SMTP_USER)
//   NOTIFY_EMAIL(default recipient for reminders; defaults to SMTP_USER)
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

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
  contactId?: number; // for the sent-emails log
  kind?: string; // 'email' | 'task' | 'test'
}): Promise<void> {
  const transport = getTransport();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
  const to = opts.to || notifyRecipient();
  if (!to) throw new MailConfigError("לא הוגדר נמען (NOTIFY_EMAIL).");
  try {
    await transport.sendMail({ from, to, subject: opts.subject, text: opts.text, html: opts.html });
    await logSent({ to, opts, status: "sent" });
  } catch (e) {
    await logSent({ to, opts, status: "failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Record a send in the SentEmail log (best-effort — never breaks sending). */
async function logSent(p: {
  to: string;
  opts: { subject: string; html?: string; contactId?: number; kind?: string };
  status: "sent" | "failed";
  error?: string;
}): Promise<void> {
  try {
    await prisma.sentEmail.create({
      data: {
        to: p.to,
        subject: p.opts.subject,
        html: p.opts.html ?? null,
        contactId: p.opts.contactId ?? null,
        kind: p.opts.kind ?? "email",
        status: p.status,
        error: p.error ?? null,
      },
    });
  } catch {
    /* logging must never block a real email */
  }
}

/** Verify the SMTP connection/credentials (used by a "send test" action). */
export async function verifyMail(): Promise<void> {
  await getTransport().verify();
}
