"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { PAYMENT_METHOD, TRANSACTION_TYPE, CURRENCY, OBLIGATION_KIND } from "@/lib/constants";

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
  onSaved,
  onCancel,
}: {
  transaction?: TransactionData;
  fixedContactId?: number | null;
  fixedKind?: "income" | "expense";
  fixedObligationId?: number | null;
  obligations?: ObligationOption[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(transaction?.id);
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
  const showObligationSelect = fixedObligationId == null && obligations.length > 0;

  return (
    <form onSubmit={submit} className="space-y-4">
      {!isEdit && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          עסקה ידנית נרשמת ישירות במערכת ואינה נשלחת לקשר.
        </p>
      )}
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
