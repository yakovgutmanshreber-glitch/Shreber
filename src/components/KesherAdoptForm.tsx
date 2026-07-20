"use client";

import { useState } from "react";
import { api } from "@/lib/client";

interface AdoptResult {
  reference?: string;
  obligationCreated?: boolean;
  fetched?: number;
  created?: number;
  updated?: number;
}

// Link an obligation that already exists in Kesher: enter its אסמכתא or a card
// token → imports the obligation + all its past transactions for this contact;
// future payments then attach automatically via the webhook.
export function KesherAdoptForm({
  contactId,
  onDone,
  onCancel,
}: {
  contactId: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [refOrToken, setRefOrToken] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdoptResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<AdoptResult>("/api/obligations/adopt", {
        method: "POST",
        body: { refOrToken, contactId, kind },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="font-semibold">הייבוא הושלם ✓ (אסמכתא {result.reference})</div>
          <ul className="mt-1 space-y-0.5">
            <li>
              התחייבות: {result.obligationCreated ? "נוצרה חדשה" : "קיימת — עודכנה וקושרה"}
            </li>
            <li>נמצאו בקשר: {result.fetched} עסקאות</li>
            <li>נוספו: {result.created} · עודכנו: {result.updated}</li>
          </ul>
          <p className="mt-2 text-xs text-green-700">
            מעתה כל תשלום חדש בהוראה זו ייקלט אוטומטית דרך ה-Webhook.
          </p>
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
      <p className="text-sm text-gray-500">
        להוראת קבע שכבר קיימת בקשר: הזן את האסמכתא (ObligationReference) או טוקן של הכרטיס —
        המערכת תייבא את ההתחייבות ואת כל העסקאות שלה, ותמשיך לקלוט כל תשלום חדש אוטומטית.
      </p>
      <div>
        <label className="label">אסמכתא / טוקן *</label>
        <input
          className="input font-mono"
          dir="ltr"
          value={refOrToken}
          onChange={(e) => setRefOrToken(e.target.value)}
          placeholder="490349 או 04372467171035433"
          required
        />
      </div>
      <div>
        <label className="label">סוג</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "income" | "expense")}>
          <option value="income">הכנסה</option>
          <option value="expense">הוצאה</option>
        </select>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "מייבא מקשר… (עד כחצי דקה)" : "ייבא מקשר"}
        </button>
      </div>
    </form>
  );
}
