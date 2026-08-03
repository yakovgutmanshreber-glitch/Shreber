// Central place for enum values + their Hebrew labels.

export const OBLIGATION_KIND = {
  expense: "הוצאה",
  income: "הכנסה",
} as const;
export type ObligationKind = keyof typeof OBLIGATION_KIND;

export const OBLIGATION_STATUS = {
  active: "פעיל",
  paused: "מושהה",
  cancelled: "מבוטל",
  pending_bank_auth: "ממתין לאישור בנק",
  bank_auth_cancelled: "אישור בנק בוטל",
  payment_method_cancelled: "אמצעי תשלום בוטל",
  finished: "הסתיים",
  init_error: "שגיאת אתחול",
} as const;
export type ObligationStatus = keyof typeof OBLIGATION_STATUS;

// Kesher's numeric obligation-status codes (used when PUSHING changes to Kesher
// via UpdateObligation). Inverse of OBLIGATION_STATUS_BY_CODE in the webhook.
export const KESHER_OBLIGATION_STATUS_CODE: Record<string, number> = {
  active: 1,
  paused: 2,
  cancelled: 3,
  pending_bank_auth: 4,
  bank_auth_cancelled: 5,
  payment_method_cancelled: 6,
  finished: 7,
  init_error: 8,
};

export const PAYMENT_METHOD = {
  credit: "כרטיס אשראי",
  bank: "העברה בנקאית / הו״ק",
  cash: "מזומן",
  check: "צ׳ק",
  bit: "ביט",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHOD;

// תרומות מיוחדות dropdowns — STARTER options (adjust to taste).
export const LEREGEL_OPTIONS = [
  "לעילוי נשמת",
  "רפואה שלמה",
  "הצלחה",
  "זיווג הגון",
  "פרנסה טובה",
  "לידה",
  "בר מצווה",
  "חתונה",
  "יום הולדת",
  "הכרת הטוב",
] as const;

export const DONATION_TYPE_OPTIONS = [
  "נדר",
  "נדבה",
  "מעשר",
  "תרומה",
  "צדקה",
] as const;

export const TRANSACTION_TYPE = {
  debit: "חיוב",
  credit: "זיכוי",
} as const;
export type TransactionType = keyof typeof TRANSACTION_TYPE;

export const TRANSACTION_SOURCE = {
  api: "קשר (API)",
  manual: "ידני",
} as const;
export type TransactionSource = keyof typeof TRANSACTION_SOURCE;

export const CURRENCY = {
  1: "₪ שקל",
  2: "$ דולר",
  826: "£ לירה שטרלינג",
  978: "€ אירו",
  124: "$ דולר קנדי",
} as const;

// ISO numeric currency code -> 3-letter code (for FX rates).
export const CURRENCY_CODE: Record<number, string> = {
  1: "ILS",
  2: "USD",
  826: "GBP",
  978: "EUR",
  124: "CAD",
};

// Kesher internal status codes (also seeded into the KesherStatus table).
export const KESHER_STATUS: Record<number, string> = {
  0: "עבר בהצלחה", // Kesher request code "000" (approved) — normalized to success
  1: "ממתין לשליחה",
  2: "עסקה שבוטלה לפני שידור",
  4: "עבר בהצלחה",
  5: "נתונים שגויים",
  6: "נכשל בשידור",
  7: "בוטל",
  8: "ממתין לסליקה",
  9: "חזר",
  10: "בבירור",
  11: "עבר בהצלחה (וריאציה נוספת)",
  14: "עסקה שלא עברה והוסרה מהדוח",
  15: "נתונים שגויים",
  16: "לא יסלק",
  21: "ביט (ממתין לאישור המשלם)",
  22: "אישור חלקי",
  23: "עסקה שבוטלה בשידור יזום",
};

// Which status codes represent a "successful/settled" charge.
export const KESHER_SUCCESS_CODES = new Set([0, 4, 11, 22]);

export function statusLabel<T extends Record<string, string>>(
  map: T,
  key: string | null | undefined,
): string {
  if (!key) return "";
  return (map as Record<string, string>)[key] ?? key;
}
