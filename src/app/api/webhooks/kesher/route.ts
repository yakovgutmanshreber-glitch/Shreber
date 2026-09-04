import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kesher } from "@/lib/kesher/client";
import { KESHER_OBLIGATION_STATUS_CODE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Kesher webhook receiver — the PRIMARY sync mechanism (spec §2).
// Kesher pushes here on every create/update of Transaction, Obligation,
// Customer. We log every payload, then upsert into our tables.
//
// Auth: Kesher's docs don't fully specify webhook signing. We accept a shared
// secret via ?secret= query param OR the X-Kesher-Secret header. This needs
// confirmation with Kesher support — flagged in the README.
// ---------------------------------------------------------------------------

function pick<T = unknown>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

function toStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Kesher `Sum`/`Total` fields are decimal shekels (NOT agorot) per the API docs. */
function toAmount(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isNaN(n) ? undefined : n;
}

function detectEntity(body: Record<string, unknown>): "transaction" | "obligation" | "customer" | "unknown" {
  // Kesher's webhook entities are named CrmTransaction / CrmObligation /
  // CrmCustomer (per the Webhook doc). Detect by explicit type or nested key.
  const explicit = toStr(pick(body, "EntityType", "Type", "entity"))?.toLowerCase();
  const hasKey = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  if (explicit?.includes("trans") || hasKey("CrmTransaction")) return "transaction";
  if (explicit?.includes("oblig") || hasKey("CrmObligation")) return "obligation";
  if (explicit?.includes("cust") || explicit?.includes("client") || hasKey("CrmCustomer"))
    return "customer";
  // Infer from fields present.
  if (pick(body, "NumTransaction", "num_transaction")) return "transaction";
  if (pick(body, "ObligationReference", "obligation_reference")) return "obligation";
  if (pick(body, "ClientRef", "ClientReference", "client_ref")) return "customer";
  return "unknown";
}

/** Kesher wraps the payload under CrmTransaction/CrmObligation/CrmCustomer — unwrap it. */
function unwrapCrm(body: Record<string, unknown>): Record<string, unknown> {
  for (const k of ["CrmTransaction", "CrmObligation", "CrmCustomer"]) {
    const inner = body[k];
    if (inner && typeof inner === "object") return { ...body, ...(inner as Record<string, unknown>) };
  }
  return body;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.KESHER_WEBHOOK_SECRET;
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-kesher-secret");

  const rawText = await req.text();

  // Always log the raw payload first (audit/debug), before validation.
  const headersLog = JSON.stringify({
    "content-type": req.headers.get("content-type"),
    "user-agent": req.headers.get("user-agent"),
  });

  if (expected && provided !== expected) {
    await prisma.webhookLog.create({
      data: { payload: rawText, headers: headersLog, status: "error", error: "unauthorized (bad secret)" },
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawText);
  } catch {
    await prisma.webhookLog.create({
      data: { payload: rawText, headers: headersLog, status: "error", error: "invalid JSON" },
    });
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Some Kesher payloads nest the object under `Json` / `Data`.
  if (typeof body.Json === "string") {
    try {
      body = { ...body, ...JSON.parse(body.Json as string) };
    } catch {
      /* ignore */
    }
  }
  const inner = (body.Data ?? body.data) as Record<string, unknown> | undefined;
  if (inner && typeof inner === "object") body = { ...body, ...inner };

  // Kesher's real webhook is a UNIFIED payload with nested Customer / Transaction
  // / Obligation / ChargeOption objects (verified live 2026-07-21) — NOT the flat
  // CrmTransaction/CrmObligation shape. Each entity's own field names already
  // match what the handlers read, so we flatten the present entity onto the top
  // level and route it. (Old flat/CrmX format still handled as a fallback.)
  const obl = asObject(body.Obligation);
  const txn = asObject(body.Transaction);
  const cust = asObject(body.Customer);
  const chargeOpt = asObject(body.ChargeOption);
  const hasNested = Boolean(obl || txn || cust);

  const entityType: "transaction" | "obligation" | "customer" | "unknown" =
    txn && pick(txn, "NumTransaction") ? "transaction"
    : obl && pick(obl, "ObligationReference") ? "obligation"
    : cust && pick(cust, "ClientRef") ? "customer"
    : detectEntity(body);

  const log = await prisma.webhookLog.create({
    data: { entityType, payload: rawText, headers: headersLog, status: "received" },
  });

  try {
    // STRICT FILTER: we only save data that belongs to records tracked in OUR
    // system (obligations/contacts we created or already imported, and charges
    // we initiated). Everything else Kesher pushes is logged as "ignored".
    let outcome: "processed" | "ignored" = "ignored";
    const mark = (r: "processed" | "ignored") => {
      if (r === "processed") outcome = "processed";
    };

    if (hasNested) {
      // Obligation status/amount/day sync (e.g. a cancel or edit made in Kesher).
      if (obl && pick(obl, "ObligationReference")) {
        const flat: Record<string, unknown> = { ...body, ...(cust ?? {}), ...obl };
        if (chargeOpt) flat.ChargeOption = chargeOpt; // keep for card sync later
        mark(await upsertObligation(flat));
      }
      // A real charge (Kesher's monthly hok debit, success or סירוב).
      if (txn && pick(txn, "NumTransaction")) {
        const flat: Record<string, unknown> = { ...body, ...(cust ?? {}), ...txn };
        if (obl && pick(obl, "ObligationReference")) flat.ObligationReference = obl.ObligationReference;
        mark(await upsertTransaction(flat));
      }
      // Customer detail changes.
      if (cust && pick(cust, "ClientRef")) {
        mark(await upsertCustomer({ ...body, ...cust }));
      }
    } else {
      // Legacy flat / CrmX payloads.
      const flat = unwrapCrm(body);
      if (entityType === "customer") mark(await upsertCustomer(flat));
      else if (entityType === "obligation") mark(await upsertObligation(flat));
      else if (entityType === "transaction") mark(await upsertTransaction(flat));
    }

    await prisma.webhookLog.update({ where: { id: log.id }, data: { status: outcome } });
    return NextResponse.json({ ok: true, entityType, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing error";
    await prisma.webhookLog.update({ where: { id: log.id }, data: { status: "error", error: message } });
    console.error("Webhook processing error:", err);
    // Return 200 so Kesher doesn't hammer retries for a data issue on our side,
    // but the error is recorded in WebhookLog for debugging.
    return NextResponse.json({ ok: false, error: message });
  }
}

async function upsertCustomer(body: Record<string, unknown>): Promise<"processed" | "ignored"> {
  const clientRef = toStr(pick(body, "ClientRef", "ClientReference", "client_ref"));
  if (!clientRef) throw new Error("customer payload missing ClientRef");

  // Update-only: we don't auto-create contacts from account-wide webhook noise.
  const existing = await prisma.contact.findUnique({ where: { kesherClientRef: clientRef } });
  if (!existing) return "ignored";

  const firstName = toStr(pick(body, "FirstName", "first_name")) ?? "";
  const lastName = toStr(pick(body, "LastName", "last_name"));
  await prisma.contact.update({
    where: { id: existing.id },
    data: {
      firstName: firstName || existing.firstName,
      lastName,
      phone: toStr(pick(body, "Phone", "phone")),
      phone2: toStr(pick(body, "Phone2", "phone2")),
      email: toStr(pick(body, "Email", "email")),
      tz: toStr(pick(body, "TZ", "tz")),
      address: toStr(pick(body, "Address", "address")),
      city: toStr(pick(body, "City", "city")),
    },
  });
  return "processed";
}

/** Payer display name as Kesher sent it (FirstName holds the full name; LastName often empty). */
function payerName(body: Record<string, unknown>): string | undefined {
  const full = [toStr(pick(body, "FirstName", "first_name")), toStr(pick(body, "LastName", "last_name"))]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || toStr(pick(body, "ReceiptName", "CardName", "Name"));
}
/** Payer phone as Kesher sent it. */
function payerPhone(body: Record<string, unknown>): string | undefined {
  return toStr(pick(body, "Phone", "phone")) || toStr(pick(body, "Phone2", "phone2"));
}
/** Kesher project / payment-page name (פרויקט). */
function projectName(body: Record<string, unknown>): string | undefined {
  return toStr(pick(body, "ProjectName", "PaymentPage", "project_name"));
}

/** National phone digits (drop +972 / leading 0 / punctuation). */
function normPhone(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").replace(/^972/, "").replace(/^0/, "");
}

/** Find a contact whose phone / phone2 matches one of these values (by last 7 digits). */
async function contactIdByPhone(...vals: unknown[]): Promise<number | null> {
  for (const v of vals) {
    const nat = normPhone(v);
    if (nat.length < 7) continue;
    const last7 = nat.slice(-7);
    const c = await prisma.contact.findFirst({
      where: { OR: [{ phone: { contains: last7 } }, { phone2: { contains: last7 } }] },
      select: { id: true },
    });
    if (c) return c.id;
  }
  return null;
}

/** Card-change flow: when a replacement hok activates, cancel the old one in Kesher. */
async function cancelReplacedHok(replacesObligationId: number | null | undefined): Promise<void> {
  if (!replacesObligationId) return;
  const old = await prisma.obligation.findUnique({ where: { id: replacesObligationId } });
  if (!old?.kesherObligationReference) return;
  if (["cancelled", "finished"].includes(old.status)) return;
  try {
    await kesher.updateObligation({
      obligationReference: old.kesherObligationReference,
      status: String(KESHER_OBLIGATION_STATUS_CODE.cancelled), // 3
    });
  } catch {
    /* best-effort — still mark locally so the old card stops being shown as active */
  }
  await prisma.obligation.update({ where: { id: old.id }, data: { status: "cancelled" } });
}

async function upsertObligation(body: Record<string, unknown>): Promise<"processed" | "ignored"> {
  const ref = toStr(pick(body, "ObligationReference", "obligation_reference"));
  if (!ref) throw new Error("obligation payload missing ObligationReference");

  // Case A activation: a PENDING obligation we created for a payment-page hok
  // carries our id back via addactiondata ("obligation:<id>"). On the hok's
  // first webhook, stamp Kesher's reference onto it and activate it.
  const addData = toStr(pick(body, "AddData", "addactiondata", "AddActionData", "ObligationApiIdentity"));
  const m = addData?.match(/obligation:(\d+)/);
  if (m) {
    const pending = await prisma.obligation.findUnique({ where: { id: Number(m[1]) } });
    if (pending && !pending.kesherObligationReference) {
      await prisma.obligation.update({
        where: { id: pending.id },
        data: { kesherObligationReference: ref, status: "active" },
      });
      // Card-change flow: this hok replaced an old one → cancel the old one.
      await cancelReplacedHok(pending.replacesObligationId);
      return "processed";
    }
  }

  const statusRaw = pick(body, "ObligationStatus", "Status", "status");
  const existing = await prisma.obligation.findUnique({ where: { kesherObligationReference: ref } });

  // NEW obligation from Kesher: capture it. Auto-link to a contact when its
  // phone matches; otherwise leave it unlinked for the review screen.
  if (!existing) {
    const contactId = await contactIdByPhone(
      pick(body, "Phone", "phone"),
      pick(body, "Phone2", "phone2"),
    );
    const numPayments = Number(pick(body, "NumPayments", "num_payments") ?? 9999) || 9999;
    const day = pick(body, "ChargeDay", "charge_day");
    await prisma.obligation.create({
      data: {
        kind: "income",
        contactId,
        kesherObligationReference: ref,
        chargeType: "recurring",
        recurringAmount: toAmount(pick(body, "Sum", "sum")) ?? 0,
        currency: Number(pick(body, "Currency", "currency") ?? 1),
        numPayments,
        chargeDay: day ? Number(day) : null,
        startDate: parseDate(pick(body, "StartDate", "start_date", "TransactionDate", "Date")),
        status: mapObligationStatus(statusRaw),
        paymentMethod: mapChargeOption(toStr(pick(body, "ChargeOptionType", "ChargeOption", "PaymentMethod"))),
        payerName: payerName(body),
        payerPhone: payerPhone(body),
        projectName: projectName(body),
        comment: "התקבל מקשר (Webhook)",
      },
    });
    return "processed";
  }

  await prisma.obligation.update({
    where: { id: existing.id },
    data: {
      recurringAmount: toAmount(pick(body, "Sum", "sum")) ?? existing.recurringAmount,
      numPayments: Number(pick(body, "NumPayments", "num_payments") ?? existing.numPayments),
      chargeDay: pick(body, "ChargeDay", "charge_day")
        ? Number(pick(body, "ChargeDay", "charge_day"))
        : existing.chargeDay,
      status: mapObligationStatus(statusRaw),
      // Backfill payer/project when missing (undefined => Prisma skips the field).
      payerName: existing.payerName ?? payerName(body),
      payerPhone: existing.payerPhone ?? payerPhone(body),
      projectName: existing.projectName ?? projectName(body),
      // Back-fill the contact link if it was unlinked and a phone now matches.
      ...(existing.contactId
        ? {}
        : { contactId: await contactIdByPhone(pick(body, "Phone", "phone"), pick(body, "Phone2", "phone2")) }),
    },
  });
  return "processed";
}

async function upsertTransaction(body: Record<string, unknown>): Promise<"processed" | "ignored"> {
  const numTransaction = toStr(pick(body, "NumTransaction", "num_transaction"));
  const uniqNum = toStr(pick(body, "UniqNum", "uniq_num"));
  if (!numTransaction && !uniqNum) throw new Error("transaction payload missing NumTransaction/UniqNum");

  // Link to obligation via ObligationReference.
  const oblRef = toStr(pick(body, "ObligationReference", "obligation_reference"));
  let obligation = oblRef
    ? await prisma.obligation.findUnique({ where: { kesherObligationReference: oblRef } })
    : null;

  // Case A: a payment-page hok's first charge may arrive carrying our
  // addactiondata ("obligation:<id>") before the ref is stamped — activate it.
  if (!obligation && oblRef) {
    const addData = toStr(pick(body, "AddData", "addactiondata", "AddActionData"));
    const m = addData?.match(/obligation:(\d+)/);
    if (m) {
      const pending = await prisma.obligation.findUnique({ where: { id: Number(m[1]) } });
      if (pending && !pending.kesherObligationReference) {
        obligation = await prisma.obligation.update({
          where: { id: pending.id },
          data: { kesherObligationReference: oblRef, status: "active" },
        });
        await cancelReplacedHok(pending.replacesObligationId);
      }
    }
  }

  const ours = numTransaction
    ? await prisma.transaction.findUnique({ where: { kesherNumTransaction: numTransaction } })
    : await prisma.transaction.findFirst({ where: { uniqNum } });

  // Contact: prefer the obligation's, else the existing record's, else match by
  // phone. A transaction with no contact match is captured as "unlinked".
  const contactId =
    obligation?.contactId ??
    ours?.contactId ??
    (await contactIdByPhone(pick(body, "Phone", "phone"), pick(body, "Phone2", "phone2")));

  // KesherStatus is the internal status code (matches our KesherStatus table).
  const statusCode = pick(body, "KesherStatus", "StatusCode", "status_code");
  // DocumentsDetails may be an object { PdfLink, PdfLinkCopy, DocNumber }.
  const docs = pick(body, "DocumentsDetails") as Record<string, unknown> | undefined;
  const data = {
    obligationId: obligation?.id ?? null,
    contactId,
    source: "api" as const,
    kesherNumTransaction: numTransaction ?? null,
    uniqNum: uniqNum ?? null,
    // `Sum`/`Total` are decimal shekels per the API docs — no agorot conversion.
    amount: toAmount(pick(body, "Sum", "Total", "Amount", "sum")) ?? 0,
    currency: Number(pick(body, "Currency", "currency") ?? 1),
    transactionDate: parseDate(pick(body, "TransactionDate", "Date", "transaction_date")),
    transactionType: (toStr(pick(body, "TransactionType")) === "credit" ? "credit" : "debit") as
      | "credit"
      | "debit",
    chargeOptionType: mapChargeOption(toStr(pick(body, "ChargeOptionType", "ChargeOption", "PaymentMethod"))),
    statusCode: statusCode !== undefined ? Number(statusCode) : null,
    statusText: toStr(pick(body, "Status", "StatusText", "ResultMessage")),
    // `CardMumber` is Kesher's (mis-spelled) field for the card's last 4 digits.
    cardLast4: toStr(pick(body, "CardMumber", "CardLast4", "Last4")),
    // `ExpairyDate` (their spelling) is MMYY.
    cardExpiry: toStr(pick(body, "ExpairyDate", "ExpireDate", "CardExpiry")),
    bank: toStr(pick(body, "Bank")),
    branch: toStr(pick(body, "Branch")),
    account: toStr(pick(body, "AccountNumber", "Account")),
    authNum: toStr(pick(body, "OKNum", "AuthNum")),
    receiptDocNumber: toStr(docs?.DocNumber ?? pick(body, "DocNumber", "ReceiptDocNumber")),
    receiptLink: toStr(docs?.PdfLink ?? pick(body, "PdfLink", "ReceiptLink")),
    payerName: payerName(body),
    payerPhone: payerPhone(body),
    projectName: projectName(body),
    kind: (obligation?.kind ?? "income") as "income" | "expense",
  };

  if (ours) {
    // Keep our local obligation/contact linkage when the payload doesn't carry one.
    await prisma.transaction.update({
      where: { id: ours.id },
      data: {
        ...data,
        obligationId: obligation?.id ?? ours.obligationId,
        contactId: obligation?.contactId ?? ours.contactId,
      },
    });
  } else {
    await prisma.transaction.create({ data });
  }

  // If this payload carries a card Token (e.g. from the hosted payment page),
  // save it as a CreditCard for the resolved contact so it can be reused.
  await maybeSaveCardToken(body, obligation?.contactId ?? null, data);
  return "processed";
}

/**
 * Save a card token from a webhook payload when possible. The hosted payment
 * page echoes our `addactiondata` back (as AddData "contact:<id>"), so we can
 * link the returned token to the right contact.
 */
async function maybeSaveCardToken(
  body: Record<string, unknown>,
  fallbackContactId: number | null,
  tx: { cardLast4?: string | null; cardExpiry?: string | null },
) {
  const token = toStr(pick(body, "Token", "token"));
  if (!token) return;

  // Resolve the contact: AddData "contact:<id>" → ClientRef → linked obligation.
  let contactId = fallbackContactId;
  const addData = toStr(pick(body, "AddData", "addactiondata", "AddActionData"));
  const m = addData?.match(/contact:(\d+)/);
  if (m) contactId = Number(m[1]);
  if (!contactId) {
    const clientRef = toStr(pick(body, "ClientRef", "ClientReference"));
    if (clientRef) {
      const c = await prisma.contact.findUnique({ where: { kesherClientRef: clientRef } });
      contactId = c?.id ?? null;
    }
  }
  if (!contactId) return;

  const existing = await prisma.creditCard.findFirst({ where: { contactId, token } });
  if (existing) return; // already saved

  const count = await prisma.creditCard.count({ where: { contactId } });
  await prisma.creditCard.create({
    data: {
      contactId,
      token,
      last4: tx.cardLast4 ?? toStr(pick(body, "CardMumber", "CardLast4")),
      expiry: tx.cardExpiry ?? toStr(pick(body, "ExpairyDate", "ExpireDate")),
      brand: toStr(pick(body, "IssuerCompany", "CardType", "CreditCardCompany")),
      holderName: toStr(pick(body, "CardName", "Name")),
      isDefault: count === 0,
    },
  });
}

function parseDate(v: unknown): Date {
  if (!v) return new Date();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function mapChargeOption(v?: string): "credit" | "bank" | "cash" | "check" | "bit" {
  const s = v?.toLowerCase() ?? "";
  if (s.includes("bank")) return "bank";
  if (s.includes("cash")) return "cash";
  if (s.includes("check")) return "check";
  if (s.includes("bit")) return "bit";
  return "credit";
}

// Kesher's ObligationStatus arrives as an integer code (webhook) or a string.
// Integer→status mapping is best-effort; verify exact codes with Kesher and
// adjust here if needed.
const OBLIGATION_STATUS_BY_CODE: Record<number, string> = {
  1: "active",
  2: "paused",
  3: "cancelled",
  4: "pending_bank_auth",
  5: "bank_auth_cancelled",
  6: "payment_method_cancelled",
  7: "finished",
  8: "init_error",
};

// Kesher also sends the status as a Hebrew label (e.g. "הסתיים").
const OBLIGATION_STATUS_HE: Record<string, string> = {
  פעיל: "active",
  פעילה: "active",
  מושהה: "paused",
  מבוטל: "cancelled",
  מבוטלת: "cancelled",
  בוטל: "cancelled",
  הסתיים: "finished",
  הסתיימה: "finished",
  הושלם: "finished",
  הושלמה: "finished",
};

function mapObligationStatus(v?: unknown): string {
  if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v.trim()))) {
    return OBLIGATION_STATUS_BY_CODE[Number(v)] ?? "active";
  }
  const t = String(v ?? "").trim();
  if (OBLIGATION_STATUS_HE[t]) return OBLIGATION_STATUS_HE[t];
  const s = t.toLowerCase();
  const known = Object.values(OBLIGATION_STATUS_BY_CODE);
  return known.includes(s) ? s : "active";
}
