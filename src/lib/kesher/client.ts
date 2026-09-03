// ---------------------------------------------------------------------------
// Kesher API client (kesherhk.info)
//
// This module is the single, isolated boundary to Kesher. Request shaping is
// based on Kesher's official API documentation (verified live against project
// 1596). It centralizes:
//   • credential loading (env secrets + project number from DB settings)
//   • the real request envelope (see below)
//   • MOCK mode so the app runs end-to-end without live credentials/charges
//
// LEGACY endpoint (ConnectToKesher/ConnectToKesher) request shape:
//   {
//     "Json": {
//       "func": "<ActionName>",
//       "format": "json",
//       "userName": "<user>",
//       "password": "<pass>",
//       ...params            // either direct siblings OR a named sub-object
//     },
//     "format": "json"
//   }
//   Response: { Code, Status, Data, Description }  — Status === true means OK.
//
// REST endpoints (KesherAPI/*) use Bearer-token auth and flat JSON bodies.
//   Response: { Code/code, Message/message, Succeeded/succeeded, Entity, ... }
//
// Amounts are in WHOLE SHEKELS (the API's `Total`/`Sum`/`sum` fields), NOT agorot.
//
// Nothing outside this folder should talk to Kesher directly.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import type {
  KesherResult,
  SendTransactionInput,
  CreditTransactionInput,
  SendBankObligationInput,
  UpdateObligationInput,
  ChangeChargeOptionInput,
  ChargeNextCollectionInput,
  GetTransInput,
} from "./types";

const LEGACY_ENDPOINT = "https://kesherhk.info/ConnectToKesher/ConnectToKesher";
const REST_BASE = "https://kesherhk.info/KesherAPI";

interface KesherCredentials {
  username: string;
  password: string;
  token: string;
  projectNumber: string;
}

/** Missing-credential problems are surfaced (not thrown) so the settings UI can render them. */
export class KesherConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KesherConfigError";
  }
}

function isMockMode(): boolean {
  if (process.env.KESHER_MOCK === "true") return true;
  // Auto-mock when the core credentials are absent.
  return !process.env.KESHER_API_USERNAME || !process.env.KESHER_API_PASSWORD;
}

/** Public helper for the Settings screen — never returns secret values. */
export async function getKesherConfigStatus() {
  const settings = await prisma.kesherSettings.findFirst();
  return {
    mock: isMockMode(),
    hasUsername: Boolean(process.env.KESHER_API_USERNAME),
    hasPassword: Boolean(process.env.KESHER_API_PASSWORD),
    hasToken: Boolean(process.env.KESHER_API_TOKEN),
    projectNumber: settings?.projectNumber ?? "",
    hasProjectNumber: Boolean(settings?.projectNumber),
    paymentPageId: settings?.paymentPageId ?? null,
    paymentPageUrl: settings?.paymentPageUrl ?? "",
    hasPaymentPage: Boolean(settings?.paymentPageId && settings?.paymentPageUrl),
    tokenPageUrl: settings?.tokenPageUrl ?? "",
    hasTokenPage: Boolean(settings?.tokenPageUrl),
  };
}

async function loadCredentials(): Promise<KesherCredentials> {
  const settings = await prisma.kesherSettings.findFirst();
  const username = process.env.KESHER_API_USERNAME ?? "";
  const password = process.env.KESHER_API_PASSWORD ?? "";
  const token = process.env.KESHER_API_TOKEN ?? "";
  const projectNumber = settings?.projectNumber ?? "";

  const missing: string[] = [];
  if (!username) missing.push("KESHER_API_USERNAME");
  if (!password) missing.push("KESHER_API_PASSWORD");
  if (missing.length) {
    throw new KesherConfigError(`חסרים פרטי התחברות לקשר: ${missing.join(", ")}`);
  }
  return { username, password, token, projectNumber };
}

// --- request shaping helpers ------------------------------------------------

/** yyyy-mm-dd for a Date or ISO string (Kesher date fields). */
function dateOnly(v?: string | Date | null): string | undefined {
  if (!v) return undefined;
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v : undefined;
  return d.toISOString().slice(0, 10);
}

/**
 * True if a value is almost certainly a raw card number (PAN) rather than a
 * Kesher token. Real Kesher tokens are ~17 digits, start with "0", and do NOT
 * pass the Luhn checksum; a PAN is 13–16 digits and DOES pass Luhn. Used to
 * reject a card number stored where a token belongs (PCI hygiene + avoids
 * Kesher's cryptic "אמצעי תשלום לא תקין").
 */
export function looksLikeCardNumber(v: string | null | undefined): boolean {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length < 13 || d.length > 16) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Kesher expects the card expiry as YYMM (year-then-month). Our UI collects it
 * as MMYY (the order printed on cards), so convert here: "1130" -> "3011".
 */
function toYymmExpiry(mmyy?: string): string | undefined {
  if (!mmyy) return undefined;
  const digits = mmyy.replace(/\D/g, "");
  if (digits.length !== 4) return mmyy; // leave unexpected input untouched
  return digits.slice(2, 4) + digits.slice(0, 2);
}

/**
 * POST to the legacy ConnectToKesher endpoint.
 * `params` are merged into the inner Json object alongside func/creds — pass
 * either direct-sibling fields (e.g. { transactionNum }) or a named sub-object
 * (e.g. { tran: {...} }) exactly as the docs specify per function.
 */
async function postLegacy<T = unknown>(
  func: string,
  params: Record<string, unknown>,
): Promise<KesherResult<T>> {
  const creds = await loadCredentials();
  const inner: Record<string, unknown> = {
    func,
    format: "json",
    userName: creds.username,
    password: creds.password,
    ...params,
  };
  const envelope = { Json: inner, format: "json" };

  let res: Response;
  try {
    res = await fetch(LEGACY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      // Hard cap so a slow/hung Kesher call can never freeze the UI.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error("קשר לא הגיב תוך 60 שניות — נסה שוב או צמצם את טווח התאריכים");
    }
    throw e;
  }
  return parseLegacyResponse<T>(res);
}

async function requestRest<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<KesherResult<T>> {
  const creds = await loadCredentials();
  // The KesherAPI (REST) Bearer token is the API password itself; an explicit
  // KESHER_API_TOKEN overrides it if ever needed.
  const bearer = creds.token || creds.password;
  if (!bearer) {
    throw new KesherConfigError(
      "נדרשים פרטי התחברות לקשר (KESHER_API_PASSWORD) עבור נקודות הקצה החדשות (KesherAPI).",
    );
  }
  const url = new URL(`${REST_BASE}${path}`);
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
  };
  if (method === "GET" && body) {
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  } else if (body) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), init);
  return parseRestResponse<T>(res);
}

async function parseLegacyResponse<T>(res: Response): Promise<KesherResult<T>> {
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw text (e.g. Cloudflare HTML error pages) */
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  // Legacy responses: { Code, Status, Data, Description }. Some funcs (e.g.
  // SendTransaction) wrap the result — including AuthNum/Token — under RequestResult.
  const rr = (obj.RequestResult as Record<string, unknown>) ?? {};
  const status = (obj.Status ?? rr.Status) as boolean | undefined;
  const code = (obj.Code ?? rr.Code) as number | string | undefined;
  const description = (obj.Description ?? rr.Description) as string | undefined;
  // "000" (string) is also a success code for SendTransaction.
  const ok = status === true || code === 0 || code === 4 || code === "000";
  // Merge RequestResult fields up so callers can pick AuthNum/Token/NumTransaction.
  const mergedData = { ...(obj.Data as object), ...obj, ...rr };
  return {
    ok: res.ok && (status !== undefined || code !== undefined ? ok : true),
    code: typeof code === "string" ? Number(code) || code : code,
    message: description,
    data: mergedData as T,
    raw: parsed,
  };
}

async function parseRestResponse<T>(res: Response): Promise<KesherResult<T>> {
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const succeeded = (obj.Succeeded ?? obj.succeeded) as boolean | undefined;
  const code = (obj.Code ?? obj.code) as number | undefined;
  const message = (obj.Message ?? obj.message) as string | undefined;
  return {
    ok: res.ok && (succeeded !== undefined ? succeeded === true : true),
    code,
    message,
    data: parsed as T,
    raw: parsed,
  };
}

// --- mock helpers -----------------------------------------------------------

function mockLegacy<T>(data: T, description = "MOCK: לא בוצעה קריאה אמיתית לקשר"): KesherResult<T> {
  return { ok: true, mock: true, code: 0, message: description, data };
}
function mockNumTransaction(): string {
  return `MOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// ---------------------------------------------------------------------------
// Public API surface (spec §2), shaped to the real Kesher docs.
// ---------------------------------------------------------------------------

export const kesher = {
  isMock: isMockMode,

  /**
   * Create a temporary token for Kesher's hosted payment page (GetLinkToken).
   * The customer then enters their card on Kesher's secure page; the card number
   * never touches our server. Returns the token in `data.Token`.
   */
  async getLinkToken(input: import("./types").GetLinkTokenInput): Promise<KesherResult> {
    if (isMockMode()) {
      return mockLegacy({ Token: `MOCKLINK${Date.now()}` });
    }
    return postLegacy("GetLinkToken", {
      request: {
        PaymentPageId: input.paymentPageId,
        Total: input.total,
        Currency: input.currency ?? 1,
        FirstName: input.firstName,
        LastName: input.lastName,
        Mail: input.mail,
        Tz: input.tz,
      },
    });
  },

  /**
   * GetToken — start a no-charge tokenization on Kesher's dedicated "יצירת טוקן"
   * page. Returns a page-session token (`String`) used to open the 2-field card
   * page. `customerRef` links the token to our contact; the final card token is
   * delivered to the page's configured callback ("נתיב לקבלת טוקן").
   */
  async getToken(input: { customerRef: string; obligationRef?: string }): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ String: `MOCKPAGETOK${Date.now()}` });
    return postLegacy("GetToken", {
      customerRef: input.customerRef,
      obligationRef: input.obligationRef,
    });
  },

  /**
   * Tokenize a card with GetToken — a DIRECT, no-charge API: send the card
   * number + validity (YYMM) and it returns the encrypted token string. Staff
   * type the card once and we store ONLY the token (never the PAN).
   */
  async tokenizeCard(input: {
    cardNumber: string;
    cardExpiry: string; // MMYY (converted to YYMM for Kesher)
    cvv?: string;
    holderName?: string;
  }): Promise<{ ok: boolean; token?: string; message?: string }> {
    if (isMockMode()) {
      const last4 = input.cardNumber.replace(/\D/g, "").slice(-4);
      return { ok: true, token: `0MOCKTOK${last4}` };
    }
    const res = await postLegacy("GetToken", {
      creditNum: input.cardNumber.replace(/\D/g, ""),
      validity: toYymmExpiry(input.cardExpiry), // YYMM
    });
    // GetToken returns the token as a bare string (e.g. "04523042138300000");
    // a short numeric string (e.g. "406") is an error code.
    const d = res.data as Record<string, unknown> | undefined;
    const candidate =
      (typeof d?.String === "string" && d.String) ||
      (typeof d?.Token === "string" && d.Token) ||
      (typeof res.raw === "string" ? res.raw : res.raw != null ? String(res.raw) : "");
    const token = /^\d{12,}$/.test(String(candidate).trim()) ? String(candidate).trim() : undefined;
    if (!token) {
      return {
        ok: false,
        message: `אימות הכרטיס בקשר נכשל${candidate ? ` (קוד ${candidate})` : ""}`,
      };
    }
    return { ok: true, token };
  },

  /** Charge with a saved token or full card details (recurring Obligation charges). */
  async sendTransaction(input: SendTransactionInput): Promise<KesherResult> {
    if (isMockMode()) {
      // Mock a successful charge. When a raw card is sent (tokenize-on-first-charge),
      // return a token derived from the last 4 so the flow can be tested end-to-end.
      const last4 = input.cardNumber?.replace(/\D/g, "").slice(-4);
      return mockLegacy({
        NumTransaction: mockNumTransaction(),
        OKNum: `OK${Math.floor(Math.random() * 1e5)}`,
        Token: input.token ?? `MOCKTOK${last4 ?? "0000"}`,
        ObligationReference:
          input.creditType === 10 || (input.numPayments && input.numPayments !== 1)
            ? `MOCK-OBL-${Date.now()}`
            : undefined,
      });
    }
    const creds = await loadCredentials();
    const useToken = Boolean(input.token);

    // Per Kesher's SendTransaction spec: charge either a saved Token OR raw card
    // details. Required fields: Total (AGOROT), Currency, CreditType,
    // TransactionType, ParamJ ('J4' = immediate debit), ProjectNumber, UniqNum.
    //
    // CRITICAL (verified by live probing): a regular single charge must NOT
    // include NumPayment at all — sending NumPayment:1 makes Kesher reject the
    // whole request with 415 "הוזנו נתונים לא תקינים". Installments require
    // CreditType 8 + FirstPayment, with NumPayment = payments AFTER the first
    // and Total = FirstPayment + fixed × NumPayment.
    const totalAgorot = Math.round(input.amount * 100);
    let creditType = input.creditType ?? 1; // 1 = regular
    let installmentFields: Record<string, unknown> = {};
    if (creditType === 10) {
      // הוראת קבע (standing order): Kesher creates a recurring hok and charges it
      // itself every period. Total = the per-period amount; NumPayment = number of
      // periods (9999 = ongoing/unlimited). No FirstPayment split. Optionally
      // TransactionDate schedules the first charge (future date => charge deferred).
      const months = input.numPayments && input.numPayments > 0 ? input.numPayments : 9999;
      installmentFields = { NumPayment: months };
      if (input.startDate) installmentFields.TransactionDate = dateOnly(input.startDate);
    } else {
      const n = input.numPayments && input.numPayments > 1 ? input.numPayments : 1;
      if (n > 1) {
        creditType = 8; // תשלומים
        const fixed = Math.floor(totalAgorot / n);
        const first = totalAgorot - fixed * (n - 1); // first payment absorbs the remainder
        installmentFields = { NumPayment: n - 1, FirstPayment: first };
      }
    }

    const tran: Record<string, unknown> = {
      Token: useToken ? input.token : undefined,
      CreditNum: useToken ? undefined : input.cardNumber,
      // Expiry (YYMM) is required by Kesher even for token charges — send it whenever we have it.
      Expiry: toYymmExpiry(input.cardExpiry),
      Cvv2: useToken ? undefined : input.cvv,
      Total: totalAgorot,
      Currency: input.currency ?? 1,
      CreditType: creditType,
      TransactionType: "debit",
      ParamJ: "J4", // action type: J4 = actual immediate charge
      ...installmentFields,
      Comment1: input.comment,
      ProjectNumber: Number(creds.projectNumber) || creds.projectNumber,
      UniqNum: input.uniqNum?.slice(0, 19),
      // Customer details (so Kesher shows the payer, not "בעילום שם").
      Id: input.tz, // ת.ז.
      FirstName: input.firstName,
      LastName: input.lastName,
      Phone: input.phone,
      Phone2: input.phone2,
      Mail: input.mail,
      Address: input.address,
      City: input.city,
    };
    return postLegacy("SendTransaction", { tran });
  },

  /** Refund / credit an existing transaction. */
  async creditTransaction(input: CreditTransactionInput): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ NumTransaction: mockNumTransaction() });
    return postLegacy("CreditTransaction", { transactionNum: input.numTransaction });
  },

  /** Create a bank standing order (הוראת קבע בנקאית). */
  async sendBankObligation(input: SendBankObligationInput): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ Data: `MOCK-OBL-${Date.now()}` });
    const creds = await loadCredentials();
    const transaction: Record<string, unknown> = {
      Total: input.sum,
      NumPayment: input.numPayments ?? 9999,
      Bank: input.bank,
      Branch: input.branch,
      Account: input.account,
      Comment1: input.comment,
      TransactionDate: dateOnly(input.startDate),
      ProjectNumber: creds.projectNumber,
    };
    return postLegacy("SendBankObligation", { transaction });
  },

  /** Manual cash/check/bank-transfer transaction recorded in Kesher. */
  async sendCashTransaction(input: {
    amount: number;
    currency?: number;
    transactionType?: "debit" | "credit";
    chargeOptionType?: "Cash" | "Check" | "BankTransfer" | "Wallet";
    bank?: string;
    branch?: string;
    account?: string;
    checkNumber?: string;
    firstName?: string;
    lastName?: string;
    comment?: string;
  }): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ NumTransaction: mockNumTransaction() });
    const creds = await loadCredentials();
    const cashTran: Record<string, unknown> = {
      Total: input.amount,
      Currency: input.currency ?? 1,
      TransactionType: input.transactionType ?? "debit",
      ChargeOptionType: input.chargeOptionType ?? "Cash",
      Bank: input.bank,
      Branch: input.branch,
      Account: input.account,
      CheckNumber: input.checkNumber,
      FirstName: input.firstName,
      LastName: input.lastName,
      Comment1: input.comment,
      ProjectNumber: creds.projectNumber,
    };
    return postLegacy("SendCashTransaction", { cashTran });
  },

  /** Update sum/date/status of an existing standing order. */
  async updateObligation(input: UpdateObligationInput): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ updated: true });
    // Field NAMES + ORDER matter (WCF schema, verified live against project 1596):
    // Day, Sum, status, StartDate, NumPayments, ObligationRef — in this order.
    // `status` is a NUMBER (1 active / 2 paused / 3 cancelled) or null to leave it
    // unchanged; Sum/Day are strings; Sum is in SHEKELS. Success = Status:true
    // (Code 944 "פעולה בוצעה בהצלחה"); a missing hok => Code 989, Status:false.
    const obligDetails: Record<string, unknown> = {
      Day: input.chargeDay != null ? String(input.chargeDay) : null,
      Sum: input.sum != null ? String(input.sum) : null,
      status: input.status != null && input.status !== "" ? Number(input.status) : null,
      StartDate: input.startDate ? dateOnly(input.startDate) : null,
      NumPayments: input.numPayments ?? null,
      ObligationRef: input.obligationReference,
    };
    return postLegacy("UpdateObligation", { obligDetails });
  },

  /** Change the payment method on an obligation (REST endpoint, Bearer). */
  async changeChargeOptionForObligation(input: ChangeChargeOptionInput): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ changed: true });
    // Exact shape per the API doc (project 1596). type: 1 = credit card, 2 = bank
    // (verified: the webhook's ChargeOption.Type is 1 for a tokenized card).
    // accountOrToken = the card token; expiryOrBranch = card expiry (MMYY).
    return requestRest("POST", "/ChangeChargeOptionForObligation", {
      obligationReference: input.obligationReference,
      CompanyDeveloperMail:
        input.companyDeveloperMail ?? process.env.KESHER_DEVELOPER_MAIL ?? undefined,
      addChargeOptionRequest: {
        entity: {
          tz: input.tz ?? null,
          bank: input.bank ?? null,
          name: input.name ?? null,
          type: input.paymentMethod === "bank" ? 2 : 1,
          limitSum: null,
          limitDate: null,
          hasBankAuth: 0,
          accountOrToken: input.token ?? input.cardNumber,
          expiryOrBranch: input.cardExpiry ?? input.branch,
        },
      },
    });
  },

  /** One-off extra charge on the next collection cycle (REST endpoint, Bearer). */
  async chargeNextCollection(input: ChargeNextCollectionInput): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ scheduled: true });
    return requestRest("POST", "/ChargeNextCollection", {
      sum: String(input.amount),
      reference: input.obligationReference,
      companyDeveloperMail: input.companyDeveloperMail,
    });
  },

  /** Check bank authorization status (REST, Bearer). */
  async hasBankAuth(params: {
    instituteCode?: string;
    bank?: string;
    branch?: string;
    account?: string;
  }): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ Succeeded: true, Entity: { BankAuthStatus: 3 } });
    return requestRest("GET", "/HasBankAuth", params);
  },

  async getBankAuthList(params: {
    instituteCode?: string;
    fromDate?: string;
    toDate?: string;
  } = {}): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ Entities: [] });
    return requestRest("GET", "/GetBankAuthList", params);
  },

  /** Fetch transactions by date range or from a transaction id (on-demand report). */
  async getTrans(input: GetTransInput): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ transactions: [] });
    return postLegacy("GetTrans", {
      fromDate: input.fromDate,
      toDate: input.toDate,
      fromTranId: input.fromNumTransaction,
    });
  },

  /**
   * Full transaction report including failed transactions (on-demand).
   * Type/Succedded control filtering per the docs.
   */
  async getAllTransForCompany(
    fromDate?: string,
    toDate?: string,
    opts: { type?: number; succeeded?: number } = {},
  ): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ TransactionResponseData: [] });
    return postLegacy("GetAllTransForCompany", {
      tranDetails: {
        Type: opts.type ?? 5,
        FromDate: fromDate,
        ToDate: toDate,
        Succedded: opts.succeeded ?? 0,
        FromTranId: null,
        ToTranId: null,
      },
    });
  },

  /** Full data for a single transaction. */
  async getTranData(numTransaction: string): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ NumTransaction: numTransaction });
    return postLegacy("GetTranData", { transactionNum: numTransaction });
  },

  /** List of standing orders. */
  async getObligations(
    fromDate?: string,
    toDate?: string,
    obligationRef?: string,
  ): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ obligations: [] });
    return postLegacy("GetObligations", { fromDate, toDate, obligationRef });
  },

  /** Cancel a transaction before transmission. */
  async cancelTranByNumTransaction(numTransaction: string): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ cancelled: true });
    return postLegacy("CancelTranByNumTransaction", { numTransaction });
  },

  /** Validate a card number. */
  async checkGetCreditCard(cardNumber: string): Promise<KesherResult> {
    if (isMockMode()) return mockLegacy({ valid: true });
    return postLegacy("CheckGetCreditCard", { CreditNum: cardNumber });
  },
};

export type KesherClient = typeof kesher;
