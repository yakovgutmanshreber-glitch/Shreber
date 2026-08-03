"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatCurrency } from "@/lib/format";
import { OBLIGATION_STATUS, PAYMENT_METHOD, OBLIGATION_KIND, CURRENCY } from "@/lib/constants";

interface Category {
  id: number;
  mainCategory: string;
  category: string;
  defaultPrice: number;
}

export interface SavedCard {
  id: number;
  last4: string | null;
  brand: string | null;
  isDefault: boolean;
}

export interface ObligationData {
  id?: number;
  kind?: "income" | "expense";
  categoryId?: number | null;
  contactId?: number | null;
  creditCardId?: number | null;
  chargeType?: "recurring" | "installments" | "onetime";
  recurringAmount?: number;
  currency?: number;
  numPayments?: number;
  chargeDay?: number | null;
  startDate?: string;
  status?: string;
  paymentMethod?: string;
  bank?: string | null;
  branch?: string | null;
  account?: string | null;
  checkNumber?: string | null;
  comment?: string | null;
  kesherObligationReference?: string | null;
}

const BRANDS = ["ויזה", "מאסטרקארד", "ישראכרט", "אמריקן אקספרס", "דיינרס"];

export function ObligationForm({
  obligation,
  fixedContactId,
  fixedKind,
  contactCards = [],
  onSaved,
  onCancel,
}: {
  obligation?: ObligationData;
  fixedContactId?: number | null;
  fixedKind?: "income" | "expense";
  contactCards?: SavedCard[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(obligation?.id);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ObligationData>(
    obligation ?? {
      kind: fixedKind ?? "income",
      contactId: fixedContactId ?? null,
      chargeType: "recurring",
      recurringAmount: 0,
      currency: 1,
      numPayments: 9999,
      startDate: new Date().toISOString().slice(0, 10),
      status: "active",
      paymentMethod: "cash",
    },
  );

  // Credit-card selection (only relevant for NEW credit obligations).
  const [cardMode, setCardMode] = useState<"existing" | "new">(
    contactCards.length > 0 ? "existing" : "new",
  );
  const [selectedCardId, setSelectedCardId] = useState<number | "">(
    contactCards.find((c) => c.isDefault)?.id ?? contactCards[0]?.id ?? "",
  );
  const [card, setCard] = useState({
    cardNumber: "",
    cardExpiry: "",
    cvv: "",
    cardHolder: "",
    cardBrand: "",
    saveCard: true,
  });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Non-credit obligations: optionally record the received payment (transaction)
  // on the same form. (Credit goes through Kesher, which reports transactions.)
  const [recordTx, setRecordTx] = useState(true);
  const [txAmount, setTxAmount] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api<Category[]>("/api/categories").then(setCategories).catch(() => {});
  }, []);

  function set<K extends keyof ObligationData>(k: K, v: ObligationData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setC(k: keyof typeof card, v: unknown) {
    setCard((c) => ({ ...c, [k]: v }));
  }

  const isCredit = form.paymentMethod === "credit";
  const chargesViaKesher = !isEdit && isCredit; // new credit obligation → charge/set up in Kesher
  const isRecurringCredit = chargesViaKesher && form.chargeType === "recurring";
  // A hok Kesher owns (imported or created via Kesher). Kesher's UpdateObligation
  // can change only Sum / Day / StartDate / NumPayments / status — NOT the charge
  // type or payment method. So lock those two when editing such an obligation.
  const isKesherTracked = isEdit && Boolean(obligation?.kesherObligationReference);
  // Non-credit payments (מזומן/צ׳ק/העברה/ביט) are always one-time: no charge-type
  // toggle, no installments, no monthly charge day.
  const isOnetime = form.chargeType === "onetime" || !isCredit;
  const amount = Number(form.recurringAmount ?? 0);
  const n = Number(form.numPayments ?? 0);
  const chargeHint =
    isOnetime
      ? `חיוב חד פעמי של ${formatCurrency(amount)}`
      : form.chargeType === "installments" && n > 1
        ? `${formatCurrency(amount / n)} × ${n} תשלומים`
        : form.chargeType === "recurring"
          ? n === 9999
            ? `${formatCurrency(amount)} בכל חודש (ללא הגבלה)`
            : `${formatCurrency(amount)} × ${n} חודשים = ${formatCurrency(amount * n)}`
          : "";

  // Switching charge type: one-time is always a single payment.
  function setChargeType(t: "recurring" | "installments" | "onetime") {
    setForm((f) => ({ ...f, chargeType: t, numPayments: t === "onetime" ? 1 : f.numPayments }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const base = {
        ...form,
        contactId: fixedContactId ?? form.contactId ?? null,
        kind: fixedKind ?? form.kind,
        // Non-credit obligations are always a single one-time entry.
        ...(!isCredit ? { chargeType: "onetime" as const, numPayments: 1, chargeDay: null } : {}),
      };

      if (isEdit) {
        await api(`/api/obligations/${obligation!.id}`, { method: "PATCH", body: base });
      } else if (isCredit) {
        // Path A — create the obligation AND set it up in Kesher. For הוראת קבע
        // (CreditType 10) Kesher creates the recurring hok and charges it monthly;
        // one-time / installments charge immediately. All use a saved/new card.
        if (cardMode === "existing" && !selectedCardId) {
          throw new Error("יש לבחור כרטיס לחיוב");
        }
        await api("/api/obligations/create-and-charge", {
          method: "POST",
          body: {
            ...base,
            useCardId: cardMode === "existing" ? selectedCardId : null,
            ...(cardMode === "new"
              ? {
                  cardNumber: card.cardNumber,
                  cardExpiry: card.cardExpiry,
                  cvv: card.cvv,
                  cardHolder: card.cardHolder,
                  cardBrand: card.cardBrand,
                  saveCard: card.saveCard,
                }
              : {}),
          },
        });
      } else {
        // Non-credit: create the obligation, and optionally record the received
        // payment as a transaction on the same form.
        const created = await api<{ id: number }>("/api/obligations", { method: "POST", body: base });
        if (recordTx) {
          await api("/api/transactions", {
            method: "POST",
            body: {
              obligationId: created.id,
              contactId: base.contactId,
              source: "manual",
              amount: Number(txAmount) || Number(form.recurringAmount) || 0,
              currency: 1,
              transactionDate: txDate || form.startDate,
              transactionType: "debit",
              chargeOptionType: form.paymentMethod,
              statusCode: 4, // עבר בהצלחה (received)
              statusText: "התקבל",
              bank: form.bank ?? null,
              branch: form.branch ?? null,
              account: form.account ?? null,
              comment: form.checkNumber ? `צ׳ק ${form.checkNumber}` : form.comment ?? null,
              kind: base.kind,
            },
          });
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!fixedKind && (
          <div>
            <label className="label">סוג</label>
            <select
              className="input"
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as "income" | "expense")}
            >
              {Object.entries(OBLIGATION_KIND).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">קטגוריה</label>
          <select
            className="input"
            value={form.categoryId ?? ""}
            onChange={(e) => {
              const cid = e.target.value ? Number(e.target.value) : null;
              set("categoryId", cid);
              const cat = categories.find((c) => c.id === cid);
              if (cat && !form.recurringAmount) set("recurringAmount", Number(cat.defaultPrice));
            }}
          >
            <option value="">— ללא —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.mainCategory} › {c.category}
              </option>
            ))}
          </select>
        </div>

        {/* Charge type toggle — credit only, and only when NOT a Kesher-owned hok
            (Kesher can't convert a הוראת קבע to תשלומים etc.). Non-credit = one-time. */}
        {isCredit && !isKesherTracked && (
          <div className="sm:col-span-2">
            <label className="label">סוג חיוב</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={form.chargeType === "recurring" ? "btn-primary" : "btn-secondary"}
                onClick={() => setChargeType("recurring")}
              >
                הוראת קבע
              </button>
              <button
                type="button"
                className={form.chargeType === "installments" ? "btn-primary" : "btn-secondary"}
                onClick={() => setChargeType("installments")}
              >
                תשלומים
              </button>
              <button
                type="button"
                className={form.chargeType === "onetime" ? "btn-primary" : "btn-secondary"}
                onClick={() => setChargeType("onetime")}
              >
                חד פעמי
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {form.chargeType === "recurring"
                ? "סכום שנגבה בכל חודש"
                : form.chargeType === "installments"
                  ? "סכום כולל שמחולק למספר תשלומים"
                  : "חיוב יחיד, ללא חזרה"}
            </p>
          </div>
        )}

        {/* Kesher owns this hok — charge type is fixed at creation, read-only. */}
        {isCredit && isKesherTracked && (
          <div className="sm:col-span-2">
            <label className="label">סוג חיוב</label>
            <div className="input flex items-center justify-between bg-gray-50 text-gray-600">
              <span>
                {form.chargeType === "recurring"
                  ? "הוראת קבע"
                  : form.chargeType === "installments"
                    ? "תשלומים"
                    : "חד פעמי"}
              </span>
              <span className="text-xs text-gray-400">נקבע בקשר — לא ניתן לשינוי</span>
            </div>
          </div>
        )}

        <div>
          <label className="label">
            {isOnetime ? "סכום (₪)" : form.chargeType === "installments" ? "סכום כולל (₪)" : "סכום לחיוב חודשי (₪)"}
          </label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.recurringAmount ?? 0}
            onChange={(e) => set("recurringAmount", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">מטבע</label>
          <select
            className="input"
            value={form.currency ?? 1}
            onChange={(e) => set("currency", Number(e.target.value))}
          >
            {Object.entries(CURRENCY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {!isOnetime && (
          <div>
            <label className="label">מספר תשלומים (9999 = ללא הגבלה)</label>
            <input
              type="number"
              className="input"
              value={form.numPayments ?? 9999}
              onChange={(e) => set("numPayments", Number(e.target.value))}
            />
          </div>
        )}
        {chargeHint && (
          <div className="sm:col-span-2 -mt-1">
            <p className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500">{chargeHint}</p>
          </div>
        )}

        {!isOnetime && (
          <div>
            <label className="label">יום חיוב בחודש</label>
            <input
              type="number"
              min={1}
              max={31}
              className="input"
              value={form.chargeDay ?? ""}
              onChange={(e) => set("chargeDay", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        )}
        <div>
          <label className="label">{isOnetime ? "תאריך החיוב" : "תאריך התחלה"}</label>
          <input
            type="date"
            className="input"
            value={form.startDate?.slice(0, 10) ?? ""}
            onChange={(e) => set("startDate", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">אמצעי תשלום</label>
          {isKesherTracked ? (
            // Kesher owns the hok — the payment method is fixed at creation.
            <div className="input flex items-center justify-between bg-gray-50 text-gray-600">
              <span>{PAYMENT_METHOD[form.paymentMethod as keyof typeof PAYMENT_METHOD] ?? form.paymentMethod}</span>
              <span className="text-xs text-gray-400">נקבע בקשר — לא ניתן לשינוי</span>
            </div>
          ) : (
            <select
              className="input"
              value={form.paymentMethod}
              onChange={(e) => set("paymentMethod", e.target.value)}
            >
              {Object.entries(PAYMENT_METHOD).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Check payment: check number + bank/branch/account. */}
        {form.paymentMethod === "check" && (
          <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
            <div>
              <label className="label">מספר צ׳ק</label>
              <input className="input" value={form.checkNumber ?? ""} onChange={(e) => set("checkNumber", e.target.value)} />
            </div>
            <div>
              <label className="label">בנק</label>
              <input className="input" value={form.bank ?? ""} onChange={(e) => set("bank", e.target.value)} />
            </div>
            <div>
              <label className="label">סניף</label>
              <input className="input" value={form.branch ?? ""} onChange={(e) => set("branch", e.target.value)} />
            </div>
            <div>
              <label className="label">מספר חשבון</label>
              <input className="input" value={form.account ?? ""} onChange={(e) => set("account", e.target.value)} />
            </div>
          </div>
        )}

        {/* Bank transfer / הו״ק: bank/branch/account only. */}
        {form.paymentMethod === "bank" && (
          <div className="sm:col-span-2 grid grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
            <div>
              <label className="label">בנק</label>
              <input className="input" value={form.bank ?? ""} onChange={(e) => set("bank", e.target.value)} />
            </div>
            <div>
              <label className="label">סניף</label>
              <input className="input" value={form.branch ?? ""} onChange={(e) => set("branch", e.target.value)} />
            </div>
            <div>
              <label className="label">מספר חשבון</label>
              <input className="input" value={form.account ?? ""} onChange={(e) => set("account", e.target.value)} />
            </div>
          </div>
        )}

        {/* Change the card on a Kesher-owned hok → syncs via ChangeChargeOption. */}
        {isKesherTracked && isCredit && (
          <div className="sm:col-span-2">
            <label className="label">כרטיס אשראי</label>
            {contactCards.length > 0 ? (
              <select
                className="input"
                value={form.creditCardId ?? ""}
                onChange={(e) => set("creditCardId", e.target.value ? Number(e.target.value) : null)}
              >
                {contactCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.brand ?? "כרטיס"} •••• {c.last4 ?? "????"}
                    {c.isDefault ? " (ברירת מחדל)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                אין כרטיסים שמורים לאיש קשר זה. הוסף כרטיס דרך "💳 כרטיסי אשראי" ואז בחר אותו כאן.
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              בחירת כרטיס אחר תעדכן את אמצעי התשלום של הוראת הקבע בקשר.
            </p>
          </div>
        )}
        {/* Status is set from Kesher's results — only expose it when EDITING. */}
        {isEdit && (
          <div>
            <label className="label">סטטוס</label>
            <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(OBLIGATION_STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* הוראת קבע (Path A): Kesher owns the hok and charges it every month. */}
      {isRecurringCredit && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-sm text-gray-600">
          🔁 עם השמירה תיווצר הוראת קבע בקשר עם הכרטיס שנבחר. מרגע זה <b>קשר אחראית</b> על ההוראה
          ותחייב את הכרטיס אוטומטית בכל חודש. כל תשלום (הצלחה או סירוב) ייקלט כאן אוטומטית דרך ה-Webhook.
        </div>
      )}

      {/* Credit-card selection — for all credit obligations (הוראת קבע / תשלומים / חד פעמי) */}
      {chargesViaKesher && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <div className="mb-2 text-sm font-semibold text-gray-700">כרטיס לחיוב</div>

          {contactCards.length > 0 && (
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                className={cardMode === "existing" ? "btn-primary flex-1 !py-1.5 text-xs" : "btn-secondary flex-1 !py-1.5 text-xs"}
                onClick={() => setCardMode("existing")}
              >
                כרטיס שמור
              </button>
              <button
                type="button"
                className={cardMode === "new" ? "btn-primary flex-1 !py-1.5 text-xs" : "btn-secondary flex-1 !py-1.5 text-xs"}
                onClick={() => setCardMode("new")}
              >
                כרטיס חדש
              </button>
            </div>
          )}

          {cardMode === "existing" && contactCards.length > 0 ? (
            <select
              className="input"
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value ? Number(e.target.value) : "")}
            >
              {contactCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brand ?? "כרטיס"} •••• {c.last4 ?? "????"}
                  {c.isDefault ? " (ברירת מחדל)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-3">
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                הכרטיס נשלח לקשר לצורך חיוב ויצירת טוקן. מספר הכרטיס וה-CVV אינם נשמרים במערכת.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">מספר כרטיס</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={card.cardNumber}
                    onChange={(e) => setC("cardNumber", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">תוקף (MMYY)</label>
                  <input
                    className="input"
                    placeholder="1228"
                    maxLength={4}
                    value={card.cardExpiry}
                    onChange={(e) => setC("cardExpiry", e.target.value.replace(/\D/g, "").slice(0, 4))}
                    required
                  />
                </div>
                <div>
                  <label className="label">CVV</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={4}
                    value={card.cvv}
                    onChange={(e) => setC("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
                <div>
                  <label className="label">שם בעל הכרטיס</label>
                  <input className="input" value={card.cardHolder} onChange={(e) => setC("cardHolder", e.target.value)} />
                </div>
                <div>
                  <label className="label">חברת אשראי</label>
                  <select className="input" value={card.cardBrand} onChange={(e) => setC("cardBrand", e.target.value)}>
                    <option value="">— בחר —</option>
                    {BRANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {(fixedContactId ?? form.contactId) && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={card.saveCard} onChange={(e) => setC("saveCard", e.target.checked)} />
                  שמור את הכרטיס (הטוקן) לחיובים עתידיים
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* Non-credit new obligation: record the received payment inline. */}
      {!isCredit && !isEdit && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input type="checkbox" checked={recordTx} onChange={(e) => setRecordTx(e.target.checked)} />
            רשום תשלום שהתקבל (עסקה)
          </label>
          {recordTx && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">סכום העסקה (₪)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder={String(form.recurringAmount ?? 0)}
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label">תאריך העסקה</label>
                <input
                  type="date"
                  className="input"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-400">
            אם ריק — יירשם סכום ההתחייבות. באשראי אין צורך: קשר שולח את העסקאות אוטומטית.
          </p>
        </div>
      )}

      <div>
        <label className="label">הערה</label>
        <textarea
          className="input"
          rows={2}
          value={form.comment ?? ""}
          onChange={(e) => set("comment", e.target.value)}
        />
      </div>

      {chargesViaKesher && (
        <p className="text-xs text-amber-600">
          {isRecurringCredit
            ? "⚠️ שמירה תקים הוראת קבע בקשר. אם תאריך ההתחלה הוא היום — יבוצע חיוב ראשון מיד."
            : "⚠️ שמירה תבצע חיוב בפועל בקשר (או חיוב הדמיה במצב Mock) ותרשום את העסקה הראשונה."}
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button
          type="submit"
          className={chargesViaKesher ? "btn-danger" : "btn-primary"}
          disabled={saving}
        >
          {saving
            ? "מעבד…"
            : isRecurringCredit
              ? "הקם הוראת קבע בקשר"
              : chargesViaKesher
                ? "צור וחייב בקשר"
                : "שמירה"}
        </button>
      </div>
    </form>
  );
}
