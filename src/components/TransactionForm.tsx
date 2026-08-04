"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { PAYMENT_METHOD, TRANSACTION_TYPE, CURRENCY, OBLIGATION_KIND } from "@/lib/constants";
import type { SavedCard } from "@/components/ObligationForm";

interface ObligationOption {
  id: number;
  kind?: string;
  category?: { category: string } | null;
  recurringAmount?: number;
}

export interface TransactionData {
  id?: number;
  kind?: string;
  obligationId?: number | null;
  amount?: number;
  currency?: number;
  amountIls?: number | null;
  transactionDate?: string;
  transactionType?: string;
  chargeOptionType?: string;
  comment?: string | null;
  bank?: string | null;
  branch?: string | null;
  account?: string | null;
  receiptDocNumber?: string | null;
  source?: string;
}

export function TransactionForm({
  transaction,
  fixedContactId,
  fixedKind,
  fixedObligationId,
  obligations = [],
  contactCards = [],
  onSaved,
  onCancel,
}: {
  transaction?: TransactionData;
  fixedContactId?: number | null;
  fixedKind?: "income" | "expense";
  fixedObligationId?: number | null;
  obligations?: ObligationOption[];
  contactCards?: SavedCard[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(transaction?.id);
  const [cardMode, setCardMode] = useState<"existing" | "new">(
    contactCards.length > 0 ? "existing" : "new",
  );
  const [selectedCardId, setSelectedCardId] = useState<number | "">(
    contactCards.find((c) => c.isDefault)?.id ?? contactCards[0]?.id ?? "",
  );
  const [card, setCard] = useState({ cardNumber: "", cardExpiry: "", cvv: "", cardHolder: "", cardBrand: "", saveCard: true });
  const [form, setForm] = useState({
    kind: transaction?.kind ?? fixedKind ?? "income",
    obligationId:
      fixedObligationId != null
        ? String(fixedObligationId)
        : transaction?.obligationId != null
          ? String(transaction.obligationId)
          : "",
    amount: transaction?.amount ?? 0,
    currency: transaction?.currency ?? 1,
    transactionDate: (transaction?.transactionDate ?? new Date().toISOString()).slice(0, 10),
    transactionType: transaction?.transactionType ?? "debit",
    chargeOptionType: transaction?.chargeOptionType ?? "cash",
    comment: transaction?.comment ?? "",
    bank: transaction?.bank ?? "",
    branch: transaction?.branch ?? "",
    account: transaction?.account ?? "",
    receiptDocNumber: transaction?.receiptDocNumber ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(k: string, v: unknown) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        ...form,
        contactId: fixedContactId ?? null,
        obligationId:
          fixedObligationId != null
            ? fixedObligationId
            : form.obligationId
              ? Number(form.obligationId)
              : null,
        kind: fixedKind ?? form.kind,
      };
      if (isEdit) {
        await api(`/api/transactions/${transaction!.id}`, { method: "PATCH", body });
      } else if (chargesViaKesher) {
        // Credit card on an obligation → charge via Kesher, then record the tx.
        if (cardMode === "existing" && !selectedCardId) throw new Error("יש לבחור כרטיס");
        await api(`/api/obligations/${fixedObligationId}/charge-balance`, {
          method: "POST",
          body: {
            amount: form.amount,
            ...(cardMode === "existing"
              ? { cardId: selectedCardId }
              : {
                  cardNumber: card.cardNumber,
                  cardExpiry: card.cardExpiry,
                  cvv: card.cvv,
                  cardHolder: card.cardHolder,
                  cardBrand: card.cardBrand,
                  saveCard: card.saveCard,
                }),
          },
        });
      } else {
        // Manual entry — skips the Kesher API entirely (spec §5).
        await api("/api/transactions", { method: "POST", body: { ...body, source: "manual" } });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  const isBank = form.chargeOptionType === "bank";
  const isCredit = form.chargeOptionType === "credit";
  // Credit on an obligation → charge via Kesher (needs an obligation to attach to).
  const chargesViaKesher = !isEdit && isCredit && fixedObligationId != null;
  const setC = (k: keyof typeof card, v: unknown) => setCard((c) => ({ ...c, [k]: v }));
  const showObligationSelect = fixedObligationId == null && obligations.length > 0;

  return (
    <form onSubmit={submit} className="space-y-4">
      {isEdit && transaction?.source === "api" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ עסקה זו התקבלה מקשר. לא ניתן לשנות עסקה שכבר בוצעה בקשר — עריכה כאן תשנה רק את העותק המקומי ותצא מסנכרון עם קשר.
        </p>
      )}
      {!isEdit &&
        (chargesViaKesher ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            💳 חיוב בפועל בקשר על הכרטיס שנבחר, בסכום שהוזן. העסקה תירשם אוטומטית.
          </p>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            עסקה ידנית נרשמת ישירות במערכת ואינה נשלחת לקשר.
          </p>
        ))}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!fixedKind && (
          <div>
            <label className="label">סוג</label>
            <select className="input" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {Object.entries(OBLIGATION_KIND).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        {showObligationSelect && (
          <div>
            <label className="label">שייך להתחייבות</label>
            <select
              className="input"
              value={form.obligationId}
              onChange={(e) => set("obligationId", e.target.value)}
            >
              <option value="">— ללא —</option>
              {obligations.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} {o.category?.category ?? ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">סכום</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.amount}
            onChange={(e) => set("amount", Number(e.target.value))}
            required
          />
        </div>
        <div>
          <label className="label">מטבע</label>
          <select
            className="input"
            value={form.currency}
            onChange={(e) => set("currency", Number(e.target.value))}
          >
            {Object.entries(CURRENCY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">תאריך</label>
          <input
            type="date"
            className="input"
            value={form.transactionDate}
            onChange={(e) => set("transactionDate", e.target.value)}
          />
        </div>
        <div>
          <label className="label">סוג תנועה</label>
          <select
            className="input"
            value={form.transactionType}
            onChange={(e) => set("transactionType", e.target.value)}
          >
            {Object.entries(TRANSACTION_TYPE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">אמצעי תשלום</label>
          <select
            className="input"
            value={form.chargeOptionType}
            onChange={(e) => set("chargeOptionType", e.target.value)}
          >
            {Object.entries(PAYMENT_METHOD).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">מס׳ קבלה</label>
          <input
            className="input"
            value={form.receiptDocNumber ?? ""}
            onChange={(e) => set("receiptDocNumber", e.target.value)}
          />
        </div>
      </div>

      {isBank && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">בנק</label>
            <input className="input" value={form.bank ?? ""} onChange={(e) => set("bank", e.target.value)} />
          </div>
          <div>
            <label className="label">סניף</label>
            <input className="input" value={form.branch ?? ""} onChange={(e) => set("branch", e.target.value)} />
          </div>
          <div>
            <label className="label">חשבון</label>
            <input className="input" value={form.account ?? ""} onChange={(e) => set("account", e.target.value)} />
          </div>
        </div>
      )}

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
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">מספר כרטיס</label>
                <input className="input" inputMode="numeric" value={card.cardNumber} onChange={(e) => setC("cardNumber", e.target.value)} required />
              </div>
              <div>
                <label className="label">תוקף (MMYY)</label>
                <input className="input" placeholder="1228" maxLength={4} value={card.cardExpiry} onChange={(e) => setC("cardExpiry", e.target.value.replace(/\D/g, "").slice(0, 4))} required />
              </div>
              <div>
                <label className="label">CVV</label>
                <input className="input" inputMode="numeric" maxLength={4} value={card.cvv} onChange={(e) => setC("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </div>
              <div className="col-span-2">
                <label className="label">שם בעל הכרטיס</label>
                <input className="input" value={card.cardHolder} onChange={(e) => setC("cardHolder", e.target.value)} />
              </div>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "שומר…" : "שמירה"}
        </button>
      </div>
    </form>
  );
}
