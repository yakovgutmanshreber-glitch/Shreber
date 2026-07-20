"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Modal, ConfirmButton } from "@/components/ui";

export interface CreditCard {
  id: number;
  token: string;
  last4: string | null;
  expiry: string | null;
  brand: string | null;
  holderName: string | null;
  label: string | null;
  isDefault: boolean;
}

export function CreditCardsSection({
  contactId,
  cards,
  onChanged,
}: {
  contactId: number;
  cards: CreditCard[];
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [chargeCard, setChargeCard] = useState<CreditCard | null>(null);

  async function setDefault(id: number) {
    await api(`/api/cards/${id}`, { method: "PATCH", body: { isDefault: true } });
    onChanged();
  }
  async function remove(id: number) {
    await api(`/api/cards/${id}`, { method: "DELETE" });
    onChanged();
  }

  // Rendered inside a Modal (the popup opened by the "כרטיסי אשראי" button).
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">נשמר טוקן בלבד — לא מספר הכרטיס המלא ולא CVV</p>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>
          + כרטיס
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-gray-400">לא נשמרו כרטיסים</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💳</span>
                  <div>
                    <div className="font-mono text-sm font-medium text-gray-800">
                      •••• •••• •••• {c.last4 ?? "????"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {c.brand ?? "כרטיס"}
                      {c.expiry ? ` · תוקף ${c.expiry.slice(0, 2)}/${c.expiry.slice(2)}` : ""}
                    </div>
                  </div>
                </div>
                {c.isDefault && (
                  <span className="badge bg-green-100 text-green-700">ברירת מחדל</span>
                )}
              </div>
              {(c.holderName || c.label) && (
                <div className="mt-2 text-xs text-gray-500">
                  {c.label && <span className="font-medium">{c.label}</span>}
                  {c.label && c.holderName ? " · " : ""}
                  {c.holderName}
                </div>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button className="font-semibold text-brand-600 hover:underline" onClick={() => setChargeCard(c)}>
                  חייב כרטיס זה
                </button>
                {!c.isDefault && (
                  <button className="text-gray-500 hover:underline" onClick={() => setDefault(c.id)}>
                    קבע כברירת מחדל
                  </button>
                )}
                <ConfirmButton
                  className="text-red-600 hover:underline"
                  message="למחוק את הכרטיס?"
                  onConfirm={() => remove(c.id)}
                >
                  מחיקה
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={chargeCard !== null}
        onClose={() => setChargeCard(null)}
        title={`חיוב כרטיס •••• ${chargeCard?.last4 ?? ""}`}
      >
        {chargeCard && (
          <ChargeCardForm
            card={chargeCard}
            contactId={contactId}
            onDone={() => {
              setChargeCard(null);
              onChanged();
            }}
            onCancel={() => setChargeCard(null)}
          />
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="הוספת כרטיס אשראי">
        <AddCardForm
          contactId={contactId}
          onSaved={() => {
            setAddOpen(false);
            onChanged();
          }}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>
    </div>
  );
}

function ChargeCardForm({
  card,
  contactId,
  onDone,
  onCancel,
}: {
  card: CreditCard;
  contactId: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mock: boolean; id: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await api<{ mock: boolean; transaction: { id: number } }>("/api/kesher/charge", {
        method: "POST",
        body: { cardId: card.id, contactId, amount, comment: comment || undefined, kind: "income" },
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
          {result.mock ? "חיוב הדמיה נרשם (Mock) ✓" : "החיוב בוצע בהצלחה ✓"} — עסקה #{result.id}
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
        {card.brand ?? "כרטיס"} •••• {card.last4 ?? "????"}
        {card.holderName ? ` · ${card.holderName}` : ""}
      </div>
      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
        ⚠️ במצב חי (Live) פעולה זו מבצעת חיוב אמיתי בטוקן של הכרטיס.
      </p>
      <div>
        <label className="label">סכום (₪)</label>
        <input
          type="number"
          step="0.01"
          className="input"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="label">הערה</label>
        <textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-danger" disabled={saving || amount <= 0}>
          {saving ? "מחייב…" : "בצע חיוב"}
        </button>
      </div>
    </form>
  );
}

function AddCardForm({
  contactId,
  onSaved,
  onCancel,
}: {
  contactId: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    cardNumber: "",
    expiry: "",
    cvv: "",
    holderName: "",
    isDefault: false,
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
      // The details go to Kesher for verification + tokenization; only the
      // returned token (+ last4/expiry/name) is stored in our system.
      await api(`/api/contacts/${contactId}/cards`, { method: "POST", body: form });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
        פרטי הכרטיס נשלחים לקשר לאימות וליצירת טוקן. מספר הכרטיס וה-CVV אינם נשמרים במערכת.
      </p>
      <div>
        <label className="label">מספר כרטיס *</label>
        <input
          className="input font-mono"
          inputMode="numeric"
          dir="ltr"
          value={form.cardNumber}
          onChange={(e) => set("cardNumber", e.target.value.replace(/[^\d ]/g, ""))}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">תוקף (MMYY) *</label>
          <input
            className="input"
            inputMode="numeric"
            maxLength={5}
            placeholder="1228"
            value={form.expiry}
            onChange={(e) => set("expiry", e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </div>
        <div>
          <label className="label">CVV (לא חובה)</label>
          <input
            className="input"
            inputMode="numeric"
            maxLength={4}
            value={form.cvv}
            onChange={(e) => set("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <div className="col-span-2">
          <label className="label">שם בעל הכרטיס</label>
          <input className="input" value={form.holderName} onChange={(e) => set("holderName", e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />
        קבע ככרטיס ברירת מחדל
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "מאמת מול קשר…" : "שמירה"}
        </button>
      </div>
    </form>
  );
}
