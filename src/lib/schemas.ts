import { z } from "zod";

const optionalString = z.string().trim().optional().nullable().transform((v) => v || null);

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "שם פרטי חובה"),
  lastName: optionalString,
  phone: optionalString,
  phone2: optionalString,
  email: z.string().trim().email("אימייל לא תקין").optional().nullable().or(z.literal("")).transform((v) => v || null),
  tz: optionalString,
  country: optionalString, // מדינה
  fatherName: optionalString, // אביו
  fatherInLawName: optionalString, // חותנו
  address: optionalString,
  city: optionalString,
  numHouse: optionalString,
  entrance: optionalString,
  floor: optionalString,
  apartmentNumber: optionalString,
  kesherClientRef: optionalString,
});

export const categorySchema = z.object({
  mainCategory: z.string().trim().min(1, "קטגוריה ראשית חובה"),
  category: z.string().trim().min(1, "קטגוריה חובה"),
  defaultPrice: z.coerce.number().min(0).default(0),
});

export const obligationSchema = z.object({
  kind: z.enum(["expense", "income"]),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  contactId: z.coerce.number().int().positive().optional().nullable(),
  creditCardId: z.coerce.number().int().positive().optional().nullable(),
  chargeType: z.enum(["recurring", "installments", "onetime"]).default("recurring"),
  recurringAmount: z.coerce.number().min(0).default(0),
  numPayments: z.coerce.number().int().min(1).default(9999),
  chargeDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  startDate: z.coerce.date(),
  status: z
    .enum([
      "active",
      "paused",
      "cancelled",
      "pending_bank_auth",
      "bank_auth_cancelled",
      "payment_method_cancelled",
      "finished",
      "init_error",
    ])
    .default("active"),
  paymentMethod: z.enum(["credit", "bank", "cash", "check", "bit"]).default("credit"),
  // Bank / check details (for bank-transfer, הו״ק, and check payments).
  bank: optionalString,
  branch: optionalString,
  account: optionalString,
  checkNumber: optionalString,
  comment: optionalString,
});

export const transactionSchema = z.object({
  obligationId: z.coerce.number().int().positive().optional().nullable(),
  contactId: z.coerce.number().int().positive().optional().nullable(),
  source: z.enum(["api", "manual"]).default("manual"),
  amount: z.coerce.number(),
  currency: z.coerce.number().int().default(1),
  transactionDate: z.coerce.date().default(() => new Date()),
  transactionType: z.enum(["debit", "credit"]).default("debit"),
  chargeOptionType: z.enum(["credit", "bank", "cash", "check", "bit"]).default("cash"),
  statusCode: z.coerce.number().int().optional().nullable(),
  statusText: optionalString,
  cardLast4: optionalString,
  cardExpiry: optionalString,
  bank: optionalString,
  branch: optionalString,
  account: optionalString,
  authNum: optionalString,
  comment: optionalString,
  receiptDocNumber: optionalString,
  receiptLink: optionalString,
  kind: z.enum(["expense", "income"]),
});

export const settingsSchema = z.object({
  projectNumber: z.string().trim().optional().nullable().transform((v) => v ?? ""),
  paymentPageId: z.coerce.number().int().positive().optional().nullable(),
  paymentPageUrl: z
    .string()
    .trim()
    .url("כתובת לא תקינה")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
});

// Add-card by typing the card once: the details are sent to Kesher for
// verification + tokenization and are NEVER stored — only the returned token
// plus display-only metadata are saved.
export const cardEntrySchema = z.object({
  cardNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 8 && v.length <= 19, "מספר כרטיס לא תקין"),
  expiry: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 4, "תוקף בפורמט MMYY"),
  cvv: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, "").slice(0, 4) : null)),
  holderName: optionalString,
  isDefault: z.boolean().optional().default(false),
});

// Credit cards are TOKENIZED. This schema only accepts a token + display-only
// metadata. Full PAN / CVV are intentionally NOT part of the model and are
// never stored (PCI DSS). `last4` is limited to 4 digits so a full number
// can't sneak in through that field.
export const creditCardSchema = z.object({
  token: z.string().trim().min(1, "טוקן חובה"),
  last4: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, "עד 4 ספרות בלבד")
    .optional()
    .nullable()
    .transform((v) => v || null),
  expiry: optionalString, // MMYY
  brand: optionalString,
  holderName: optionalString,
  label: optionalString,
  isDefault: z.boolean().optional().default(false),
});

// תרומות מיוחדות — special donation record, linked to a contact and to a גליון
// (a Category whose mainCategory is "גליון").
export const specialDonationSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive(), // the גליון
  occasion: optionalString, // לרגל
  amount: z.coerce.number().min(0).default(0), // סכום
  donationType: optionalString, // סוג
  entryDate: z.coerce.date().optional(),
  note: optionalString, // הערה
});

// Editable dropdown list option (לרגל / סוג).
export const listOptionSchema = z.object({
  listKey: z.enum(["leregel", "donationType", "city", "country"]),
  value: z.string().trim().min(1, "ערך חובה"),
});

// שיחות — a communication log entry, linked to an Obligation or a Transaction.
export const communicationSchema = z.object({
  obligationId: z.coerce.number().int().positive().optional().nullable(),
  transactionId: z.coerce.number().int().positive().optional().nullable(),
  date: z.coerce.date().optional(),
  note: z.string().trim().min(1, "יש להזין תוכן"),
});
