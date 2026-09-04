// ---------------------------------------------------------------------------
// On-demand import ("get the transactions") from Kesher into our DB.
//
// Uses GetAllTransForCompany (read-only report). The webhook remains the
// PRIMARY real-time sync; this importer is for backfills / manual pulls.
//
// The report returns records with Hebrew-text Currency/ChargeOptionType/
// TransactionType and a numeric StatusCode — mapped here to our enums.
// ---------------------------------------------------------------------------

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kesher } from "./client";

function s(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return String(v);
}

function currencyToCode(v: unknown): number {
  const t = String(v ?? "").trim();
  const l = t.toLowerCase();
  // Canadian dollar first (so "cad"/"c$" isn't caught by the USD "$"/"dollar" rule).
  if (t === "124" || l.includes("cad") || l.includes("קנד") || l.includes("c$")) return 124;
  if (t === "2" || t === "840" || t.includes("דולר") || l.includes("usd") || l.includes("dollar") || t.includes("$")) return 2;
  if (t === "826" || t.includes("שטרלינג") || t.includes("ליש") || l.includes("gbp") || t.includes("£")) return 826;
  if (t === "978" || t.includes("אירו") || t.includes("יורו") || l.includes("eur") || t.includes("€")) return 978;
  return 1; // שקל / default
}

function chargeOptionToEnum(v: unknown): "credit" | "bank" | "cash" | "check" | "bit" {
  const t = String(v ?? "");
  if (t.includes("מזומן")) return "cash";
  if (t.includes("המחאה") || t.includes("צ")) return "check";
  if (t.includes("העברה") || t.includes("בנק") || t.includes("הו")) return "bank";
  if (t.includes("ביט")) return "bit";
  return "credit"; // אשראי / default
}

function transactionTypeToEnum(v: unknown): "debit" | "credit" {
  const t = String(v ?? "");
  // "עסקת זכות" = credit; "עסקת חובה" = debit
  if (t.includes("זכות") || t.toLowerCase() === "credit") return "credit";
  return "debit";
}

// Transaction status codes that mean the charge went through successfully.
const TX_SUCCESS = new Set([0, 4, 11, 22]);

// Kesher obligation-status integer codes (best-effort; mirror the webhook map).
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

// Kesher's GetObligations StatusId (verified against live data).
const KESHER_OBLIGATION_STATUS_ID: Record<string, string> = {
  "1": "active", // פעיל
  "2": "cancelled", // מבוטל
  "3": "finished", // הסתיים
};

// Kesher reports a hok's status as a Hebrew string or an integer code. Map it to
// our enum, returning null when unrecognized (so callers can fall back).
function mapKesherObligationStatus(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v).trim())) {
    return OBLIGATION_STATUS_BY_CODE[Number(v)] ?? null;
  }
  const t = String(v).trim();
  const HE: Record<string, string> = {
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
  if (HE[t]) return HE[t];
  const lower = t.toLowerCase();
  return Object.values(OBLIGATION_STATUS_BY_CODE).includes(lower) ? lower : null;
}

// Determine an imported obligation's status: prefer Kesher's own status field,
// otherwise treat a finite-payment hok whose payments are all done as finished.
function deriveObligationStatus(opts: {
  meta?: Record<string, unknown> | null;
  numPayments: number;
  paidCount: number;
}): string {
  // GetObligations returns StatusId (1=פעיל, 2=מבוטל, 3=הסתיים) and a Hebrew
  // Status label. Prefer StatusId (authoritative), then the label.
  if (opts.meta) {
    const id = opts.meta.StatusId != null ? String(opts.meta.StatusId).trim() : "";
    if (KESHER_OBLIGATION_STATUS_ID[id]) return KESHER_OBLIGATION_STATUS_ID[id];
    const heb = mapKesherObligationStatus(opts.meta.Status ?? opts.meta.StatusName);
    if (heb) return heb;
  }
  if (opts.numPayments > 0 && opts.numPayments !== 9999 && opts.paidCount >= opts.numPayments) {
    return "finished";
  }
  return "active";
}

/** Extract the last 4 digits from a masked card number like "458050******8661". */
function last4(v: unknown): string | undefined {
  const digits = String(v ?? "").replace(/[^0-9]/g, "");
  return digits ? digits.slice(-4) : undefined;
}

function firstDoc(v: unknown): { pdf?: string; docNum?: string } {
  const dd = (v as { DocumentDetails?: Array<Record<string, unknown>> })?.DocumentDetails?.[0];
  if (!dd) return {};
  return { pdf: s(dd.PdfLink), docNum: s(dd.DocNumber) };
}

export interface ImportResult {
  fetched: number;
  created: number;
  updated: number;
  contactsCreated: number;
  obligationsCreated: number;
  skipped: number;
  ok: boolean;
  message?: string;
}

/**
 * Import transactions from Kesher for a date range.
 * @param fromDate ISO or yyyy-mm-dd
 * @param toDate   ISO or yyyy-mm-dd
 * @param opts.createContacts  auto-create Contacts from ClientReference (default true)
 * @param opts.createObligations auto-create Obligation shells from ObligationReference (default true)
 */
export async function importTransactions(
  fromDate: string,
  toDate: string,
  opts: { createContacts?: boolean; createObligations?: boolean } = {},
): Promise<ImportResult> {
  const createContacts = opts.createContacts ?? true;
  const createObligations = opts.createObligations ?? true;

  const from = fromDate.length === 10 ? `${fromDate}T00:00:00` : fromDate;
  const to = toDate.length === 10 ? `${toDate}T23:59:59` : toDate;

  const res = await kesher.getAllTransForCompany(from, to);
  if (!res.ok) {
    return { fetched: 0, created: 0, updated: 0, contactsCreated: 0, obligationsCreated: 0, skipped: 0, ok: false, message: res.message ?? "שגיאה בשליפת עסקאות מקשר" };
  }
  const rows = ((res.data as { TransactionResponseData?: Record<string, unknown>[] })?.TransactionResponseData) ?? [];

  const result: ImportResult = {
    fetched: rows.length,
    created: 0,
    updated: 0,
    contactsCreated: 0,
    obligationsCreated: 0,
    skipped: 0,
    ok: true,
  };

  // Cache lookups within this run.
  const contactCache = new Map<string, number>();
  const obligationCache = new Map<string, { id: number; kind: string; contactId: number | null }>();

  for (const r of rows) {
    const numTransaction = s(r.NumTransaction) ?? s(r.Id);
    if (!numTransaction) {
      result.skipped++;
      continue;
    }

    // --- Contact (by ClientReference) ---
    let contactId: number | null = null;
    const clientRef = s(r.ClientReference);
    if (clientRef) {
      if (contactCache.has(clientRef)) {
        contactId = contactCache.get(clientRef)!;
      } else {
        let contact = await prisma.contact.findUnique({ where: { kesherClientRef: clientRef } });
        if (!contact && createContacts) {
          contact = await prisma.contact.create({
            data: {
              firstName: s(r.FirstName) ?? s(r.Name) ?? "לקוח קשר",
              lastName: s(r.LastName),
              phone: s(r.Phone),
              phone2: s(r.Phone2),
              email: s(r.Mail),
              tz: s(r.Tz),
              address: s(r.Address),
              city: s(r.City),
              kesherClientRef: clientRef,
            },
          });
          result.contactsCreated++;
        }
        if (contact) {
          contactId = contact.id;
          contactCache.set(clientRef, contact.id);
        }
      }
    }

    // --- Obligation (by ObligationReference) ---
    let obligationId: number | null = null;
    let kind: "income" | "expense" = "income";
    const oblRef = s(r.ObligationReference);
    if (oblRef && oblRef !== "0") {
      if (obligationCache.has(oblRef)) {
        const o = obligationCache.get(oblRef)!;
        obligationId = o.id;
        kind = o.kind as "income" | "expense";
      } else {
        let obl = await prisma.obligation.findUnique({ where: { kesherObligationReference: oblRef } });
        if (!obl && createObligations) {
          obl = await prisma.obligation.create({
            data: {
              kind: "income",
              contactId,
              kesherObligationReference: oblRef,
              recurringAmount: Number(r.Total ?? 0) / 100, // report Total is agorot
              numPayments: Number(r.NumPayments ?? 9999),
              startDate: new Date(),
              status: "active",
              paymentMethod: chargeOptionToEnum(r.ChargeOptionType),
            },
          });
          result.obligationsCreated++;
        }
        if (obl) {
          obligationId = obl.id;
          kind = obl.kind as "income" | "expense";
          obligationCache.set(oblRef, { id: obl.id, kind: obl.kind, contactId: obl.contactId });
        }
      }
    }

    const doc = firstDoc(r.DocumentsDetails);
    const data = {
      obligationId,
      contactId,
      source: "api" as const,
      kesherNumTransaction: numTransaction,
      uniqNum: s(r.Uniq),
      amount: Number(r.Total ?? 0) / 100, // report Total is agorot
      currency: currencyToCode(r.Currency),
      transactionDate: r.TranDate ? new Date(String(r.TranDate)) : new Date(),
      transactionType: transactionTypeToEnum(r.TransactionType),
      chargeOptionType: chargeOptionToEnum(r.ChargeOptionType),
      statusCode: r.StatusCode !== undefined && r.StatusCode !== null ? Number(r.StatusCode) : null,
      statusText: s(r.Status),
      cardLast4: last4(r.NumCard),
      cardExpiry: s(r.ExpireDate),
      authNum: s(r.OKNum),
      receiptDocNumber: doc.docNum ?? s(r.DocNumber),
      receiptLink: doc.pdf,
      payerName:
        [s(r.FirstName), s(r.LastName)].filter(Boolean).join(" ").trim() ||
        s(r.ReceiptName) ||
        s(r.Name),
      payerPhone: s(r.Phone) || s(r.Phone2),
      projectName: s(r.ProjectName),
      kind,
    };

    const existing = await prisma.transaction.findUnique({
      where: { kesherNumTransaction: numTransaction },
    });
    if (existing) {
      await prisma.transaction.update({ where: { id: existing.id }, data });
      result.updated++;
    } else {
      await prisma.transaction.create({ data });
      result.created++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Adopt an obligation that already exists in Kesher (created there before this
// system): given its אסמכתא (ObligationReference) or a card Token, import the
// obligation + ALL its past transactions, linked to a contact. Once adopted,
// the webhook auto-attaches every future payment (the reference is tracked).
// ---------------------------------------------------------------------------

export interface AdoptResult {
  ok: boolean;
  message?: string;
  reference?: string;
  obligationId?: number;
  obligationCreated?: boolean;
  fetched?: number;
  created?: number;
  updated?: number;
  cardSaved?: boolean;
}

export async function adoptKesherObligation(opts: {
  refOrToken: string;
  contactId?: number | null;
  kind?: "income" | "expense";
  categoryId?: number | null;
}): Promise<AdoptResult> {
  const input = opts.refOrToken.trim().replace(/\s/g, "");
  if (!input) return { ok: false, message: "יש להזין אסמכתא או טוקן" };

  // Pull history YEAR BY YEAR, in parallel (one big multi-year call makes
  // Kesher hang; sequential yearly calls are too slow).
  const now = new Date();
  const years: { from: string; to: string }[] = [];
  for (let year = now.getFullYear(); year >= now.getFullYear() - 6; year--) {
    years.push({
      from: `${year}-01-01T00:00:00`,
      to: year === now.getFullYear() ? now.toISOString().slice(0, 19) : `${year}-12-31T23:59:59`,
    });
  }
  const reps = await Promise.all(
    years.map((y) =>
      kesher.getAllTransForCompany(y.from, y.to).catch(() => ({ ok: false as const, data: undefined })),
    ),
  );
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let anyOk = false;
  for (const rep of reps) {
    if (!rep.ok) continue;
    anyOk = true;
    const chunk =
      ((rep.data as { TransactionResponseData?: Record<string, unknown>[] })
        ?.TransactionResponseData) ?? [];
    for (const r of chunk) {
      const key = String(r.NumTransaction ?? r.Id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      rows.push(r);
    }
  }
  if (!anyOk) return { ok: false, message: "שליפת העסקאות מקשר נכשלה" };

  // Tokens are long digit strings (16-17); references are short (~6).
  const isToken = input.length >= 12;
  let ref: string | undefined = isToken ? undefined : input;
  let matched = rows.filter((r) =>
    isToken ? s(r.Token) === input : s(r.ObligationReference) === input,
  );
  if (isToken) {
    ref = matched.map((r) => s(r.ObligationReference)).find((x) => x && x !== "0");
  }
  // With a resolved reference, take the obligation's complete history.
  if (ref) matched = rows.filter((r) => s(r.ObligationReference) === ref);

  if (matched.length === 0) {
    return { ok: false, message: "לא נמצאו עסקאות בקשר עבור האסמכתא/הטוקן שהוזנו" };
  }
  if (!ref) {
    return {
      ok: false,
      message: "נמצאו עסקאות לטוקן זה אך ללא אסמכתת הוראת קבע — לא ניתן לקשר מעקב אוטומטי",
    };
  }

  // Newest first for deriving obligation details.
  matched.sort((a, b) => String(b.TranDate ?? "").localeCompare(String(a.TranDate ?? "")));
  const latest = matched[0];

  // Resolve the contact: explicit > by ClientReference from the rows.
  let contactId = opts.contactId ?? null;
  if (!contactId) {
    const clientRef = matched.map((r) => s(r.ClientReference)).find(Boolean);
    if (clientRef) {
      const c = await prisma.contact.findUnique({ where: { kesherClientRef: clientRef } });
      contactId = c?.id ?? null;
    }
  }

  // Obligation meta from Kesher's standing-order list (best effort).
  let meta: Record<string, unknown> | null = null;
  try {
    const oblRes = await kesher.getObligations("01.01.2019", `${now.getFullYear()}.12.31`, ref);
    const raw = (oblRes.data as Record<string, unknown>)?.Obligation;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    meta =
      (arr.find((o) => s((o as Record<string, unknown>).Reference) === ref) as
        | Record<string, unknown>
        | undefined) ?? null;
  } catch {
    /* fall back to transaction-derived values */
  }

  // Find or create the local obligation for this reference.
  let obligation = await prisma.obligation.findUnique({
    where: { kesherObligationReference: ref },
  });
  let obligationCreated = false;
  // Prefer the actual charged amount (ground truth) over GetObligations meta,
  // whose Sum units proved unreliable.
  const recurringAmount = Number(latest.Total ?? 0) / 100 || Number(meta?.Sum ?? 0); // report Total = agorot; meta Sum = shekels
  const numPayments = Number(meta?.NumPayments ?? 9999) || 9999;
  const chargeDay = meta?.Day ? Number(meta.Day) : new Date(String(latest.TranDate)).getDate();
  const paidCount = matched.filter(
    (r) => r.StatusCode != null && TX_SUCCESS.has(Number(r.StatusCode)),
  ).length;
  const obligationStatus = deriveObligationStatus({ meta, numPayments, paidCount });
  if (!obligation) {
    obligation = await prisma.obligation.create({
      data: {
        kind: opts.kind ?? "income",
        contactId,
        categoryId: opts.categoryId ?? null,
        kesherObligationReference: ref,
        chargeType: "recurring",
        recurringAmount,
        numPayments,
        chargeDay,
        startDate: new Date(
          String(matched[matched.length - 1].TranDate ?? now.toISOString()),
        ),
        status: obligationStatus,
        paymentMethod: chargeOptionToEnum(latest.ChargeOptionType),
        comment: `יובא מקשר (אסמכתא ${ref})`,
      },
    });
    obligationCreated = true;
  } else if (obligation.status !== obligationStatus) {
    // Re-importing: refresh the status from Kesher (source of truth).
    obligation = await prisma.obligation.update({
      where: { id: obligation.id },
      data: { status: obligationStatus, ...(contactId && !obligation.contactId ? { contactId } : {}) },
    });
  } else if (contactId && !obligation.contactId) {
    obligation = await prisma.obligation.update({
      where: { id: obligation.id },
      data: { contactId },
    });
  }
  const linkContactId = obligation.contactId ?? contactId;

  // Adopt the hok's CREDIT CARD too: the charge rows carry the card Token (that's
  // how token-based adopt matches). Save it as a CreditCard for the contact and
  // link it to the obligation, so future charges/edits can reference a saved card.
  let cardSaved = false;
  const cardToken =
    (isToken ? input : undefined) ??
    matched.map((r) => s(r.Token)).find((t) => !!t && /^\d{12,}$/.test(t));
  if (
    cardToken &&
    linkContactId &&
    chargeOptionToEnum(latest.ChargeOptionType) === "credit"
  ) {
    let card = await prisma.creditCard.findFirst({
      where: { contactId: linkContactId, token: cardToken },
    });
    if (!card) {
      const count = await prisma.creditCard.count({ where: { contactId: linkContactId } });
      card = await prisma.creditCard.create({
        data: {
          contactId: linkContactId,
          token: cardToken,
          last4: last4(latest.NumCard),
          expiry: s(latest.ExpireDate),
          brand: s(latest.CreditCardCompany) ?? s(latest.Brand),
          holderName: s(latest.CardName) ?? s(latest.Name),
          isDefault: count === 0,
        },
      });
      cardSaved = true;
    }
    if (obligation.creditCardId !== card.id) {
      obligation = await prisma.obligation.update({
        where: { id: obligation.id },
        data: { creditCardId: card.id },
      });
    }
  }

  // Import every transaction of the obligation (idempotent by NumTransaction).
  let created = 0;
  let updated = 0;
  for (const r of matched) {
    const numTransaction = s(r.NumTransaction) ?? s(r.Id);
    if (!numTransaction) continue;
    const doc = firstDoc(r.DocumentsDetails);
    const data = {
      obligationId: obligation.id,
      contactId: linkContactId,
      source: "api" as const,
      kesherNumTransaction: numTransaction,
      uniqNum: s(r.Uniq),
      amount: Number(r.Total ?? 0) / 100, // report Total is agorot
      currency: currencyToCode(r.Currency),
      transactionDate: r.TranDate ? new Date(String(r.TranDate)) : new Date(),
      transactionType: transactionTypeToEnum(r.TransactionType),
      chargeOptionType: chargeOptionToEnum(r.ChargeOptionType),
      statusCode:
        r.StatusCode !== undefined && r.StatusCode !== null ? Number(r.StatusCode) : null,
      statusText: s(r.Status),
      cardLast4: last4(r.NumCard),
      cardExpiry: s(r.ExpireDate),
      authNum: s(r.OKNum),
      receiptDocNumber: doc.docNum ?? s(r.DocNumber),
      receiptLink: doc.pdf,
      kind: obligation.kind as "income" | "expense",
    };
    const existing = await prisma.transaction.findUnique({
      where: { kesherNumTransaction: numTransaction },
    });
    if (existing) {
      await prisma.transaction.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.transaction.create({ data });
      created++;
    }
  }

  return {
    ok: true,
    reference: ref,
    obligationId: obligation.id,
    obligationCreated,
    fetched: matched.length,
    created,
    updated,
    cardSaved,
  };
}

// ---------------------------------------------------------------------------
// Import ONLY the credit-card token behind an אסמכתא / token — no obligation,
// no transactions. Saves the card on the contact so it can fund future charges.
// ---------------------------------------------------------------------------
export interface CardImportResult {
  ok: boolean;
  message?: string;
  cardSaved: boolean;
  alreadyExists?: boolean;
  last4?: string | null;
  brand?: string | null;
  reference?: string;
}

export async function importCardFromKesher(opts: {
  refOrToken: string;
  contactId: number;
}): Promise<CardImportResult> {
  const input = opts.refOrToken.trim().replace(/\s/g, "");
  if (!input) return { ok: false, cardSaved: false, message: "יש להזין אסמכתא או טוקן" };
  const contactId = opts.contactId;

  const now = new Date();
  const years: { from: string; to: string }[] = [];
  for (let year = now.getFullYear(); year >= now.getFullYear() - 6; year--) {
    years.push({
      from: `${year}-01-01T00:00:00`,
      to: year === now.getFullYear() ? now.toISOString().slice(0, 19) : `${year}-12-31T23:59:59`,
    });
  }
  const reps = await Promise.all(
    years.map((y) =>
      kesher.getAllTransForCompany(y.from, y.to).catch(() => ({ ok: false as const, data: undefined })),
    ),
  );
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let anyOk = false;
  for (const rep of reps) {
    if (!rep.ok) continue;
    anyOk = true;
    const chunk =
      ((rep.data as { TransactionResponseData?: Record<string, unknown>[] })
        ?.TransactionResponseData) ?? [];
    for (const r of chunk) {
      const key = String(r.NumTransaction ?? r.Id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      rows.push(r);
    }
  }
  if (!anyOk) return { ok: false, cardSaved: false, message: "שליפת העסקאות מקשר נכשלה" };

  const isToken = input.length >= 12;
  let ref: string | undefined = isToken ? undefined : input;
  let matched = rows.filter((r) =>
    isToken ? s(r.Token) === input : s(r.ObligationReference) === input,
  );
  if (isToken) ref = matched.map((r) => s(r.ObligationReference)).find((x) => x && x !== "0");
  if (ref) matched = rows.filter((r) => s(r.ObligationReference) === ref);
  if (matched.length === 0) {
    return { ok: false, cardSaved: false, message: "לא נמצאו עסקאות בקשר עבור האסמכתא/הטוקן שהוזנו" };
  }

  matched.sort((a, b) => String(b.TranDate ?? "").localeCompare(String(a.TranDate ?? "")));
  const validToken = (r: Record<string, unknown>) => {
    const t = s(r.Token);
    return t && /^\d{12,}$/.test(t) ? t : undefined;
  };
  const cardRow =
    matched.find((r) => validToken(r) && chargeOptionToEnum(r.ChargeOptionType) === "credit") ??
    matched.find((r) => validToken(r));
  const token = cardRow ? validToken(cardRow) : undefined;
  if (!token || !cardRow) {
    return {
      ok: false,
      cardSaved: false,
      reference: ref,
      message: "לא נמצא טוקן כרטיס אשראי בעסקאות של אסמכתא זו (ייתכן שהחיוב אינו באשראי)",
    };
  }

  const existing = await prisma.creditCard.findFirst({ where: { contactId, token } });
  if (existing) {
    return {
      ok: true,
      cardSaved: false,
      alreadyExists: true,
      reference: ref,
      last4: existing.last4,
      brand: existing.brand,
      message: "הכרטיס כבר קיים אצל איש קשר זה",
    };
  }
  const count = await prisma.creditCard.count({ where: { contactId } });
  const card = await prisma.creditCard.create({
    data: {
      contactId,
      token,
      last4: last4(cardRow.NumCard),
      expiry: s(cardRow.ExpireDate),
      brand: s(cardRow.CreditCardCompany) ?? s(cardRow.Brand),
      holderName: s(cardRow.CardName) ?? s(cardRow.Name),
      isDefault: count === 0,
    },
  });
  return { ok: true, cardSaved: true, reference: ref, last4: card.last4, brand: card.brand };
}

// ---------------------------------------------------------------------------
// BULK adopt: given rows of {phone, reference} (from a Kesher Excel), match each
// phone to an existing Contact and import that reference's obligation + all its
// transactions. Fetches the whole company's transactions ONCE (year-by-year,
// parallel) and processes every reference against that dataset.
// ---------------------------------------------------------------------------

/** Normalize a phone to its national digits (drop +972 / leading 0 / punctuation). */
function normPhone(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.replace(/^972/, "").replace(/^0/, "");
}

export interface BulkAdoptResult {
  ok: boolean;
  message?: string;
  totalRows: number;
  matched: number; // rows where a contact was found AND the ref had data
  obligationsAdopted: number;
  transactionsImported: number;
  noContact: number; // phone didn't match any contact
  noData: number; // reference had no transactions in Kesher
  details: { phone: string; reference: string; contact?: string; status: string }[];
}

// Fetch the whole company's transactions once (year-by-year, in parallel) and
// group them by ObligationReference. Shared by every bulk-adopt variant.
async function fetchKesherTxByReference(): Promise<{
  ok: boolean;
  byRef: Map<string, Record<string, unknown>[]>;
}> {
  const now = new Date();
  const years: { from: string; to: string }[] = [];
  for (let year = now.getFullYear(); year >= now.getFullYear() - 6; year--) {
    years.push({
      from: `${year}-01-01T00:00:00`,
      to: year === now.getFullYear() ? now.toISOString().slice(0, 19) : `${year}-12-31T23:59:59`,
    });
  }
  const reps = await Promise.all(
    years.map((y) =>
      kesher.getAllTransForCompany(y.from, y.to).catch(() => ({ ok: false as const, data: undefined })),
    ),
  );
  const seen = new Set<string>();
  const byRef = new Map<string, Record<string, unknown>[]>();
  let anyOk = false;
  for (const rep of reps) {
    if (!rep.ok) continue;
    anyOk = true;
    const chunk =
      ((rep.data as { TransactionResponseData?: Record<string, unknown>[] })
        ?.TransactionResponseData) ?? [];
    for (const r of chunk) {
      const key = String(r.NumTransaction ?? r.Id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      const ref = s(r.ObligationReference);
      if (ref && ref !== "0") {
        if (!byRef.has(ref)) byRef.set(ref, []);
        byRef.get(ref)!.push(r);
      }
    }
  }
  return { ok: anyOk, byRef };
}

// Fetch the whole company's standing-order (hok) list once, keyed by Reference.
// Used to fill in details for hoks that exist in Kesher but have no charges yet.
async function fetchKesherObligationMeta(): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  try {
    const now = new Date();
    const res = await kesher.getObligations("01.01.2015", `${now.getFullYear() + 1}.12.31`);
    const raw = (res.data as Record<string, unknown>)?.Obligation;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const o of arr) {
      const ref = s((o as Record<string, unknown>).Reference);
      if (ref && !map.has(ref)) map.set(ref, o as Record<string, unknown>);
    }
  } catch {
    /* meta is best-effort */
  }
  return map;
}

export async function bulkAdoptByPhone(
  input: { phone: string; reference: string; category?: string }[],
): Promise<BulkAdoptResult> {
  const empty: BulkAdoptResult = {
    ok: false,
    totalRows: input.length,
    matched: 0,
    obligationsAdopted: 0,
    transactionsImported: 0,
    noContact: 0,
    noData: 0,
    details: [],
  };

  const now = new Date();
  const { ok: anyOk, byRef } = await fetchKesherTxByReference();
  if (!anyOk) return { ...empty, message: "שליפת העסקאות מקשר נכשלה" };

  // Build a phone -> contactId lookup from existing contacts.
  const contacts = await prisma.contact.findMany({ select: { id: true, phone: true, phone2: true } });
  const phoneMap = new Map<string, number>();
  for (const c of contacts) {
    for (const p of [c.phone, c.phone2]) {
      const n = normPhone(p);
      if (n && !phoneMap.has(n)) phoneMap.set(n, c.id);
    }
  }

  // Optional per-row category (from a קטגוריה column) — resolved/created once.
  const catCache = new Map<string, number>();
  async function resolveCategory(name?: string): Promise<number | undefined> {
    const key = (name ?? "").trim();
    if (!key) return undefined;
    const cached = catCache.get(key);
    if (cached) return cached;
    let cat = await prisma.category.findFirst({ where: { category: key } });
    if (!cat) cat = await prisma.category.create({ data: { mainCategory: key, category: key, defaultPrice: 0 } });
    catCache.set(key, cat.id);
    return cat.id;
  }

  const result: BulkAdoptResult = { ...empty, ok: true };

  const rows = input
    .map((r) => ({
      phone: String(r.phone ?? "").trim(),
      reference: String(r.reference ?? "").trim(),
      category: r.category,
    }))
    .filter((r) => r.phone && r.reference);

  // --- Preload existing obligations + transactions + cards (batch) ----------
  const refs = [...new Set(rows.map((r) => r.reference))];
  const oblByRef = new Map<
    string,
    { id: number; contactId: number | null; categoryId: number | null; creditCardId: number | null }
  >();
  for (const o of await prisma.obligation.findMany({
    where: { kesherObligationReference: { in: refs } },
    select: { id: true, contactId: true, categoryId: true, creditCardId: true, kesherObligationReference: true },
  })) {
    if (o.kesherObligationReference)
      oblByRef.set(o.kesherObligationReference, {
        id: o.id,
        contactId: o.contactId,
        categoryId: o.categoryId,
        creditCardId: o.creditCardId,
      });
  }
  const allNums: string[] = [];
  for (const ref of refs)
    for (const t of byRef.get(ref) ?? []) {
      const n = s(t.NumTransaction) ?? s(t.Id);
      if (n) allNums.push(n);
    }
  const txSeen = new Set<string>();
  if (allNums.length) {
    for (const t of await prisma.transaction.findMany({
      where: { kesherNumTransaction: { in: allNums } },
      select: { kesherNumTransaction: true },
    }))
      if (t.kesherNumTransaction) txSeen.add(t.kesherNumTransaction);
  }
  const contactIds = [
    ...new Set(rows.map((r) => phoneMap.get(normPhone(r.phone))).filter((x): x is number => x != null)),
  ];
  const cardKey = (cid: number, token: string) => `${cid}:${token}`;
  const cardSeen = new Set<string>();
  const cardCount = new Map<number, number>();
  if (contactIds.length) {
    for (const c of await prisma.creditCard.findMany({
      where: { contactId: { in: contactIds } },
      select: { contactId: true, token: true },
    })) {
      cardSeen.add(cardKey(c.contactId, c.token));
      cardCount.set(c.contactId, (cardCount.get(c.contactId) ?? 0) + 1);
    }
  }

  // --- Resolve each row; collect NEW obligations for one batch insert -------
  type Work = {
    ref: string;
    phone: string;
    contactId: number;
    categoryId?: number;
    latest: Record<string, unknown>;
    matched: Record<string, unknown>[];
  };
  const work: Work[] = [];
  const toCreate: Prisma.ObligationCreateManyInput[] = [];
  for (const row of rows) {
    const ref = row.reference;
    const phone = row.phone;
    const contactId = phoneMap.get(normPhone(phone));
    if (!contactId) {
      result.noContact++;
      result.details.push({ phone, reference: ref, status: "לא נמצא איש קשר לפי טלפון" });
      continue;
    }
    const matched = (byRef.get(ref) ?? []).slice();
    if (matched.length === 0) {
      result.noData++;
      result.details.push({ phone, reference: ref, status: "אין עסקאות בקשר לאסמכתא זו" });
      continue;
    }
    matched.sort((a, b) => String(b.TranDate ?? "").localeCompare(String(a.TranDate ?? "")));
    const latest = matched[0];
    const categoryId = await resolveCategory(row.category);
    work.push({ ref, phone, contactId, categoryId, latest, matched });
    if (!oblByRef.has(ref)) {
      toCreate.push({
        kind: "income",
        contactId,
        categoryId,
        kesherObligationReference: ref,
        chargeType: "recurring",
        recurringAmount: Number(latest.Total ?? 0) / 100,
        numPayments: 9999,
        chargeDay: new Date(String(latest.TranDate)).getDate() || 1,
        startDate: new Date(String(matched[matched.length - 1].TranDate ?? now.toISOString())),
        status: "active",
        paymentMethod: chargeOptionToEnum(latest.ChargeOptionType),
        comment: `יובא מקשר (אסמכתא ${ref})`,
      });
      // Placeholder so a repeated ref isn't queued twice.
      oblByRef.set(ref, { id: 0, contactId, categoryId: categoryId ?? null, creditCardId: null });
      result.obligationsAdopted++;
    }
  }

  // --- Insert all NEW obligations in ONE batch, then re-read their ids -------
  if (toCreate.length) {
    await prisma.obligation.createMany({ data: toCreate, skipDuplicates: true });
    oblByRef.clear();
    for (const o of await prisma.obligation.findMany({
      where: { kesherObligationReference: { in: refs } },
      select: { id: true, contactId: true, categoryId: true, creditCardId: true, kesherObligationReference: true },
    })) {
      if (o.kesherObligationReference)
        oblByRef.set(o.kesherObligationReference, {
          id: o.id,
          contactId: o.contactId,
          categoryId: o.categoryId,
          creditCardId: o.creditCardId,
        });
    }
  }

  // --- Patch existing obligations that need a contact / category (few) ------
  for (const w of work) {
    const obl = oblByRef.get(w.ref);
    if (!obl || !obl.id) continue;
    const patch: { contactId?: number; categoryId?: number } = {};
    if (!obl.contactId) patch.contactId = w.contactId;
    if (w.categoryId && obl.categoryId !== w.categoryId) patch.categoryId = w.categoryId;
    if (Object.keys(patch).length) await prisma.obligation.update({ where: { id: obl.id }, data: patch });
  }

  // --- Batch-create new cards (saved to the contact) ------------------------
  const newCards: Prisma.CreditCardCreateManyInput[] = [];
  for (const w of work) {
    const token = s(w.latest.Token);
    if (
      token &&
      /^\d{12,}$/.test(token) &&
      chargeOptionToEnum(w.latest.ChargeOptionType) === "credit" &&
      !cardSeen.has(cardKey(w.contactId, token))
    ) {
      cardSeen.add(cardKey(w.contactId, token));
      const count = cardCount.get(w.contactId) ?? 0;
      cardCount.set(w.contactId, count + 1);
      newCards.push({
        contactId: w.contactId,
        token,
        last4: last4(w.latest.NumCard),
        expiry: s(w.latest.ExpireDate),
        brand: s(w.latest.CreditCardCompany) ?? s(w.latest.Brand),
        holderName: s(w.latest.CardName) ?? s(w.latest.Name),
        isDefault: count === 0,
      });
    }
  }
  if (newCards.length) await prisma.creditCard.createMany({ data: newCards });

  // --- Batch-insert new transactions ----------------------------------------
  const newTx: Prisma.TransactionCreateManyInput[] = [];
  for (const w of work) {
    const obl = oblByRef.get(w.ref);
    if (!obl || !obl.id) continue;
    for (const r of w.matched) {
      const numTransaction = s(r.NumTransaction) ?? s(r.Id);
      if (!numTransaction || txSeen.has(numTransaction)) continue;
      txSeen.add(numTransaction);
      const doc = firstDoc(r.DocumentsDetails);
      newTx.push({
        obligationId: obl.id,
        contactId: w.contactId,
        source: "api",
        kesherNumTransaction: numTransaction,
        uniqNum: s(r.Uniq),
        amount: Number(r.Total ?? 0) / 100,
        currency: currencyToCode(r.Currency),
        transactionDate: r.TranDate ? new Date(String(r.TranDate)) : new Date(),
        transactionType: transactionTypeToEnum(r.TransactionType),
        chargeOptionType: chargeOptionToEnum(r.ChargeOptionType),
        statusCode: r.StatusCode !== undefined && r.StatusCode !== null ? Number(r.StatusCode) : null,
        statusText: s(r.Status),
        cardLast4: last4(r.NumCard),
        cardExpiry: s(r.ExpireDate),
        authNum: s(r.OKNum),
        receiptDocNumber: doc.docNum ?? s(r.DocNumber),
        receiptLink: doc.pdf,
        kind: "income",
      });
      result.transactionsImported++;
    }
    result.matched++;
    result.details.push({ phone: w.phone, reference: w.ref, status: `יובאו ${w.matched.length} עסקאות` });
  }
  if (newTx.length) await prisma.transaction.createMany({ data: newTx, skipDuplicates: true });

  return result;
}

// ---------------------------------------------------------------------------
// BULK adopt (standalone): given rows of {reference, category}, import each
// reference as a STANDALONE income obligation (no contact) under the given
// category (matched by name, created if missing) + all its transactions.
// ---------------------------------------------------------------------------

export interface BulkCategoryResult {
  ok: boolean;
  message?: string;
  totalRows: number;
  matched: number;
  obligationsAdopted: number;
  transactionsImported: number;
  noData: number; // reference had no transactions in Kesher
  noCategory: number; // row was missing a category
  details: { reference: string; category: string; status: string }[];
}

export async function bulkAdoptByCategory(
  input: { reference: string; category: string }[],
): Promise<BulkCategoryResult> {
  const empty: BulkCategoryResult = {
    ok: false,
    totalRows: input.length,
    matched: 0,
    obligationsAdopted: 0,
    transactionsImported: 0,
    noData: 0,
    noCategory: 0,
    details: [],
  };

  const now = new Date();
  const { ok: anyOk, byRef } = await fetchKesherTxByReference();
  if (!anyOk) return { ...empty, message: "שליפת העסקאות מקשר נכשלה" };

  const result: BulkCategoryResult = { ...empty, ok: true };

  // Normalize + dedup rows by reference (last category wins).
  const rows = input
    .map((r) => ({ reference: String(r.reference ?? "").trim(), category: String(r.category ?? "").trim() }))
    .filter((r) => r.reference);

  // --- Resolve every category in ONE batch (create the missing ones) --------
  const catNames = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const catMap = new Map<string, number>();
  if (catNames.length) {
    for (const c of await prisma.category.findMany({ where: { category: { in: catNames } } })) {
      if (!catMap.has(c.category)) catMap.set(c.category, c.id);
    }
    for (const name of catNames) {
      if (!catMap.has(name)) {
        const c = await prisma.category.create({ data: { mainCategory: name, category: name, defaultPrice: 0 } });
        catMap.set(name, c.id);
      }
    }
  }

  // --- Preload existing obligations + transactions in ONE query each --------
  const refs = [...new Set(rows.map((r) => r.reference))];
  const oblByRef = new Map<string, { id: number; categoryId: number | null; status: string }>();
  for (const o of await prisma.obligation.findMany({
    where: { kesherObligationReference: { in: refs } },
    select: { id: true, categoryId: true, status: true, kesherObligationReference: true },
  })) {
    if (o.kesherObligationReference) {
      oblByRef.set(o.kesherObligationReference, { id: o.id, categoryId: o.categoryId, status: o.status });
    }
  }
  const allNums: string[] = [];
  for (const ref of refs) {
    for (const t of byRef.get(ref) ?? []) {
      const n = s(t.NumTransaction) ?? s(t.Id);
      if (n) allNums.push(n);
    }
  }
  const txSeen = new Set<string>();
  if (allNums.length) {
    for (const t of await prisma.transaction.findMany({
      where: { kesherNumTransaction: { in: allNums } },
      select: { kesherNumTransaction: true },
    })) {
      if (t.kesherNumTransaction) txSeen.add(t.kesherNumTransaction);
    }
  }

  // Kesher's hok list gives each obligation's real status/amount/payments.
  const meta = await fetchKesherObligationMeta();
  const statusFor = (ref: string, paidCount: number, numPayments: number) =>
    deriveObligationStatus({ meta: meta.get(ref) ?? null, numPayments, paidCount });
  const numPaymentsFor = (ref: string) => {
    const n = meta.get(ref)?.NumPayments;
    return n != null && Number(n) > 0 ? Number(n) : 9999;
  };

  // --- Process rows: create obligations as needed, collect NEW transactions -
  const newTx: Prisma.TransactionCreateManyInput[] = [];
  // References that have no transactions yet — imported as empty obligations.
  const emptyRefs: { ref: string; category: string }[] = [];

  for (const row of rows) {
    const { reference: ref, category } = row;
    if (!category) {
      result.noCategory++;
      result.details.push({ reference: ref, category: "", status: "חסרה קטגוריה בשורה" });
      continue;
    }
    const matched = (byRef.get(ref) ?? []).slice();
    if (matched.length === 0) {
      emptyRefs.push({ ref, category });
      continue;
    }
    matched.sort((a, b) => String(b.TranDate ?? "").localeCompare(String(a.TranDate ?? "")));
    const latest = matched[0];
    const categoryId = catMap.get(category)!;
    const paidCount = matched.filter(
      (r) => r.StatusCode != null && TX_SUCCESS.has(Number(r.StatusCode)),
    ).length;
    const numPayments = numPaymentsFor(ref);
    const status = statusFor(ref, paidCount, numPayments);

    let obl = oblByRef.get(ref);
    if (!obl) {
      const created = await prisma.obligation.create({
        data: {
          kind: "income",
          contactId: null,
          categoryId,
          kesherObligationReference: ref,
          chargeType: "recurring",
          recurringAmount: Number(latest.Total ?? 0) / 100,
          currency: currencyToCode(latest.Currency),
          numPayments,
          chargeDay: new Date(String(latest.TranDate)).getDate() || 1,
          startDate: new Date(String(matched[matched.length - 1].TranDate ?? now.toISOString())),
          status,
          paymentMethod: chargeOptionToEnum(latest.ChargeOptionType),
          comment: `יובא מקשר (אסמכתא ${ref})`,
        },
        select: { id: true, categoryId: true, status: true },
      });
      obl = created;
      oblByRef.set(ref, created);
      result.obligationsAdopted++;
    } else {
      // Re-import: re-sync category (from the file), status + numPayments (from Kesher).
      await prisma.obligation.update({
        where: { id: obl.id },
        data: { categoryId, status, numPayments },
      });
      obl.categoryId = categoryId;
      obl.status = status;
    }

    let imported = 0;
    for (const r of matched) {
      const numTransaction = s(r.NumTransaction) ?? s(r.Id);
      if (!numTransaction || txSeen.has(numTransaction)) continue;
      txSeen.add(numTransaction);
      const doc = firstDoc(r.DocumentsDetails);
      newTx.push({
        obligationId: obl.id,
        contactId: null,
        source: "api",
        kesherNumTransaction: numTransaction,
        uniqNum: s(r.Uniq),
        amount: Number(r.Total ?? 0) / 100,
        currency: currencyToCode(r.Currency),
        transactionDate: r.TranDate ? new Date(String(r.TranDate)) : new Date(),
        transactionType: transactionTypeToEnum(r.TransactionType),
        chargeOptionType: chargeOptionToEnum(r.ChargeOptionType),
        statusCode: r.StatusCode !== undefined && r.StatusCode !== null ? Number(r.StatusCode) : null,
        statusText: s(r.Status),
        cardLast4: last4(r.NumCard),
        cardExpiry: s(r.ExpireDate),
        authNum: s(r.OKNum),
        receiptDocNumber: doc.docNum ?? s(r.DocNumber),
        receiptLink: doc.pdf,
        kind: "income",
      });
      imported++;
    }
    result.transactionsImported += imported;
    result.matched++;
    result.details.push({ reference: ref, category, status: `יובאו ${matched.length} עסקאות` });
  }

  // --- Insert every new transaction in ONE batch ---------------------------
  if (newTx.length) {
    await prisma.transaction.createMany({ data: newTx, skipDuplicates: true });
  }

  // --- References with no charges yet: import as empty obligations ----------
  for (const { ref, category } of emptyRefs) {
    const m = meta.get(ref);
    const numPayments = numPaymentsFor(ref);
    const status = statusFor(ref, 0, numPayments);
    if (oblByRef.has(ref)) {
      const existing = oblByRef.get(ref)!;
      await prisma.obligation.update({
        where: { id: existing.id },
        data: { categoryId: catMap.get(category)!, status, numPayments },
      });
      result.matched++;
      result.details.push({ reference: ref, category, status: "כבר קיימת במערכת" });
      continue;
    }
    const day = m?.Day != null ? Number(m.Day) : NaN;
    const sd = m?.StartDate ? new Date(String(m.StartDate)) : null;
    const created = await prisma.obligation.create({
      data: {
        kind: "income",
        contactId: null,
        categoryId: catMap.get(category)!,
        kesherObligationReference: ref,
        chargeType: "recurring",
        recurringAmount: m ? Number(m.Sum ?? 0) : 0,
        currency: 1,
        numPayments,
        chargeDay: Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
        startDate: sd && !Number.isNaN(sd.getTime()) ? sd : now,
        status,
        paymentMethod: "credit",
        comment: `יובא מקשר (אסמכתא ${ref}) — ללא עסקאות עדיין`,
      },
      select: { id: true, categoryId: true, status: true },
    });
    oblByRef.set(ref, created);
    result.obligationsAdopted++;
    result.matched++;
    result.details.push({
      reference: ref,
      category,
      status: m ? "יובאה ללא עסקאות (הוראה קיימת בקשר)" : "יובאה ללא עסקאות",
    });
  }

  return result;
}
