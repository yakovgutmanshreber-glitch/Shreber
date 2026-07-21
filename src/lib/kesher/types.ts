// Types for the Kesher API client. These model the request/response shapes
// used by kesherhk.info. They intentionally use Kesher's own field names
// (PascalCase) at the wire boundary; our app-side code maps them to our
// Prisma models elsewhere.

export interface KesherResult<T = unknown> {
  ok: boolean;
  /** true when the call was short-circuited by mock mode */
  mock?: boolean;
  /** Kesher's status/result code when present */
  code?: number | string;
  message?: string;
  data?: T;
  /** raw parsed response for debugging */
  raw?: unknown;
}

export type CurrencyCode = 1 | 2 | 826 | 978;

export interface SendTransactionInput {
  /** amount in shekels (NOT agorot) — the client converts to agorot */
  amount: number;
  currency?: CurrencyCode;
  /** our unique id, max 19 chars */
  uniqNum: string;
  /** saved token OR full card details */
  token?: string;
  cardNumber?: string;
  cardExpiry?: string; // MMYY
  cvv?: string;
  tz?: string; // Israeli ID for identity verification
  clientRef?: string;
  numPayments?: number;
  creditType?: number; // Kesher credit deal type (regular / installments / הוראת קבע=10)
  /** For CreditType 10 (הוראת קבע): first-charge / schedule date. */
  startDate?: Date | string;
  comment?: string;
  // Customer details — sent so the transaction isn't anonymous ("בעילום שם") in Kesher.
  firstName?: string;
  lastName?: string;
  phone?: string;
  phone2?: string;
  mail?: string;
  address?: string;
  city?: string;
}

export interface CreditTransactionInput {
  numTransaction: string; // Kesher NumTransaction to credit/refund
  amount?: number; // partial refund in shekels; omit for full
  comment?: string;
}

export interface SendBankObligationInput {
  clientRef?: string;
  sum: number; // shekels
  numPayments?: number;
  chargeDay?: number;
  startDate?: string; // yyyy-mm-dd
  bank?: string;
  branch?: string;
  account?: string;
  comment?: string;
}

export interface UpdateObligationInput {
  obligationReference: string;
  sum?: number;
  chargeDay?: number;
  startDate?: string;
  status?: string;
}

export interface ChangeChargeOptionInput {
  obligationReference: string;
  paymentMethod: "credit" | "bank" | "cash" | "check" | "bit";
  token?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cvv?: string;
  bank?: string;
  branch?: string;
}

export interface ChargeNextCollectionInput {
  obligationReference: string;
  amount: number; // shekels
  companyDeveloperMail?: string;
  comment?: string;
}

export interface GetTransInput {
  fromDate?: string; // yyyy-mm-dd
  toDate?: string;
  fromNumTransaction?: string;
}

export interface GetLinkTokenInput {
  paymentPageId: number; // account-specific payment page id (from Kesher panel)
  total?: number; // shekels
  currency?: CurrencyCode;
  firstName?: string;
  lastName?: string;
  mail?: string;
  tz?: string;
}
