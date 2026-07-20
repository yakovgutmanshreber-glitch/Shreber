"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatCurrency } from "@/lib/format";
import { OBLIGATION_STATUS, PAYMENT_METHOD, OBLIGATION_KIND } from "@/lib/constants";

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
  numPayments?: number;
  chargeDay?: number | null;
  startDate?: string;
  status?: string;
  paymentMethod?: string;
  comment?: string | null;
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
      numPayments: 9999,
      startDate: new Date().toISOString().slice(0, 10),
      status: "active",
      paymentMethod: "credit",
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
  const [link, setLink] = useState<string | null>(null); // הוראת קבע payment-page link
  const [copied, setCopied] = useState(false);

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
  const chargesViaKesher = !isEdit && isCredit; // new credit obligation → charge Kesher
  // Credit הוראת קבע (Case A): Kesher owns the hok, set up via its payment page —
  // the card is entered on Kesher's page, not here.
  const isRecurringCredit = chargesViaKesher && form.chargeType === "recurring";
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
      } else if (isRecurringCredit) {
        // Case A — Kesher owns the hok: create a pending obligation + a
        // standing-order payment link. Keep the modal open to show the link.
        const res = await api<{ url: string }>("/api/obligations/create-recurring-link", {
          method: "POST",
          body: base,
        });
        setLink(res.url);
        return;
      } else if (isCredit) {
        // Create the obligation AND charge the card via Kesher.
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
        // Non-credit: just create the obligation; transactions entered manually.
        await api("/api/obligations", { method: "POST", body: base });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  // הוראת קבע link was generated — show it to send to the donor.
  if (link) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          הוראת הקבע נוצרה כממתינה. שלח את הקישור ללקוח (או פתח אותו) — לאחר שיזין את פרטי הכרטיס
          בעמוד המאובטח של קשר, קשר יקים את ההוראה ותחייב אוטומטית בכל חודש. כל תשלום ייקלט כאן
          אוטומטית.
        </div>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" dir="ltr" readOnly value={link} />
          <button
            type="button"
            className="btn-secondary whitespace-nowrap"
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? "הועתק ✓" : "העתק"}
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn-primary">
            פתח את עמוד התשלום
          </a>
          <button type="button" className="btn-secondary" onClick={onSaved}>
            סיום
          </button>
        </div>
      </div>
    );
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

        {/* Charge type toggle — credit only. Non-credit is always one-time. */}
        {isCredit && (
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
        </div>
        {!chargesViaKesher && (
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

      {/* הוראת קבע: the card is entered on Kesher's page — no card fields here. */}
      {isRecurringCredit && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-sm text-gray-600">
          🔒 עם השמירה ייווצר קישור לעמוד תשלום מאובטח של קשר. הלקוח יזין שם את פרטי הכרטיס פעם
          אחת, וקשר יקים הוראת קבע ותחייב אוטומטית בכל חודש — פרטי הכרטיס אינם עוברים דרך המערכת.
        </div>
      )}

      {/* Credit-card selection — one-time / installments only (not הוראת קבע) */}
      {chargesViaKesher && !isRecurringCredit && (
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

      <div>
        <label className="label">הערה</label>
        <textarea
          className="input"
          rows={2}
          value={form.comment ?? ""}
          onChange={(e) => set("comment", e.target.value)}
        />
      </div>

      {chargesViaKesher && !isRecurringCredit && (
        <p className="text-xs text-amber-600">
          ⚠️ שמירה תבצע חיוב בפועל בקשר (או חיוב הדמיה במצב Mock) ותרשום את העסקה הראשונה.
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button
          type="submit"
          className={chargesViaKesher && !isRecurringCredit ? "btn-danger" : "btn-primary"}
          disabled={saving}
        >
          {saving
            ? "מעבד…"
            : isRecurringCredit
              ? "צור קישור הוראת קבע"
              : chargesViaKesher
                ? "צור וחייב בקשר"
                : "שמירה"}
        </button>
      </div>
    </form>
  );
}
