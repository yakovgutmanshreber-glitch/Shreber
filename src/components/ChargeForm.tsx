"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { CURRENCY } from "@/lib/constants";

interface ObligationOption {
  id: number;
  category?: { category: string } | null;
}

// Sends a real charge via Kesher (SendTransaction). In live mode this MOVES
// REAL MONEY. In mock mode it just records a mock transaction.
export function ChargeForm({
  fixedContactId,
  fixedKind,
  obligations = [],
  onDone,
  onCancel,
}: {
  fixedContactId?: number | null;
  fixedKind?: "income" | "expense";
  obligations?: ObligationOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<"token" | "card">("token");
  const [form, setForm] = useState({
    amount: 0,
    currency: 1,
    token: "",
    cardNumber: "",
    cardExpiry: "",
    cvv: "",
    tz: "",
    numPayments: 1,
    comment: "",
    obligationId: "" as string,
    kind: fixedKind ?? "income",
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mock: boolean; id: number } | null>(null);
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
        amount: form.amount,
        currency: form.currency,
        tz: form.tz || undefined,
        numPayments: form.numPayments,
        comment: form.comment || undefined,
        obligationId: form.obligationId ? Number(form.obligationId) : null,
        contactId: fixedContactId ?? null,
        kind: fixedKind ?? form.kind,
        ...(method === "token"
          ? { token: form.token }
          : { cardNumber: form.cardNumber, cardExpiry: form.cardExpiry, cvv: form.cvv }),
      };
      const res = await api<{ mock: boolean; transaction: { id: number } }>("/api/kesher/charge", {
        method: "POST",
        body,
      });
      setResult({ mock: res.mock, id: res.transaction.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {result.mock ? "חיוב הדמיה נרשם (מצב Mock) ✓" : "החיוב בוצע בהצלחה בקשר ✓"} — עסקה #{result.id}
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={onDone}>
            סגור
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
        ⚠️ במצב חי (Live) פעולה זו מבצעת <b>חיוב אמיתי</b> בכרטיס/טוקן. במצב הדמיה נרשמת עסקה לדוגמה בלבד.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          className={method === "token" ? "btn-primary flex-1" : "btn-secondary flex-1"}
          onClick={() => setMethod("token")}
        >
          טוקן שמור
        </button>
        <button
          type="button"
          className={method === "card" ? "btn-primary flex-1" : "btn-secondary flex-1"}
          onClick={() => setMethod("card")}
        >
          פרטי כרטיס
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <select className="input" value={form.currency} onChange={(e) => set("currency", Number(e.target.value))}>
            {Object.entries(CURRENCY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {method === "token" ? (
          <div className="sm:col-span-2">
            <label className="label">טוקן</label>
            <input className="input" value={form.token} onChange={(e) => set("token", e.target.value)} required />
          </div>
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="label">מספר כרטיס</label>
              <input
                className="input"
                inputMode="numeric"
                value={form.cardNumber}
                onChange={(e) => set("cardNumber", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">תוקף (MMYY)</label>
              <input className="input" placeholder="1228" value={form.cardExpiry} onChange={(e) => set("cardExpiry", e.target.value)} required />
            </div>
            <div>
              <label className="label">CVV</label>
              <input className="input" value={form.cvv} onChange={(e) => set("cvv", e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label className="label">מספר תשלומים</label>
          <input type="number" min={1} className="input" value={form.numPayments} onChange={(e) => set("numPayments", Number(e.target.value))} />
        </div>
        <div>
          <label className="label">ת.ז. (אימות זהות, לא חובה)</label>
          <input className="input" value={form.tz} onChange={(e) => set("tz", e.target.value)} />
        </div>
        {obligations.length > 0 && (
          <div className="sm:col-span-2">
            <label className="label">שייך להתחייבות</label>
            <select className="input" value={form.obligationId} onChange={(e) => set("obligationId", e.target.value)}>
              <option value="">— ללא —</option>
              {obligations.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} {o.category?.category ?? ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="label">הערה</label>
        <textarea className="input" rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-danger" disabled={saving}>
          {saving ? "מחייב…" : "בצע חיוב בקשר"}
        </button>
      </div>
    </form>
  );
}
