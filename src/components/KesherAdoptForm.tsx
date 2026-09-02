"use client";

import { useState } from "react";
import { api } from "@/lib/client";

interface AdoptResult {
  reference?: string;
  obligationCreated?: boolean;
  fetched?: number;
  created?: number;
  updated?: number;
  cardSaved?: boolean;
  alreadyExists?: boolean;
  last4?: string | null;
  brand?: string | null;
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
  const [mode, setMode] = useState<"full" | "card">("full");
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
        body: { refOrToken, contactId, kind, mode },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const cardLine = `${result.brand ?? "כרטיס"} •••• ${result.last4 ?? "????"}`;
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {mode === "card" ? (
            <>
              <div className="font-semibold">
                {result.cardSaved
                  ? "💳 הכרטיס יובא ונשמר ✓"
                  : result.alreadyExists
                    ? "💳 הכרטיס כבר קיים אצל איש קשר זה"
                    : "הושלם"}
              </div>
              <ul className="mt-1 space-y-0.5">
                <li>{cardLine}</li>
                <li className="text-xs text-green-700">אסמכתא: {result.reference}</li>
                <li className="text-xs text-green-700">לא נוצרו התחייבות או עסקאות.</li>
              </ul>
            </>
          ) : (
            <>
              <div className="font-semibold">הייבוא הושלם ✓ (אסמכתא {result.reference})</div>
              <ul className="mt-1 space-y-0.5">
                <li>התחייבות: {result.obligationCreated ? "נוצרה חדשה" : "קיימת — עודכנה וקושרה"}</li>
                <li>נמצאו בקשר: {result.fetched} עסקאות</li>
                <li>נוספו: {result.created} · עודכנו: {result.updated}</li>
                {result.cardSaved && <li>💳 כרטיס האשראי של ההוראה נוסף ונשמר</li>}
              </ul>
              <p className="mt-2 text-xs text-green-700">
                מעתה כל תשלום חדש בהוראה זו ייקלט אוטומטית דרך ה-Webhook.
              </p>
            </>
          )}
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
        להוראת קבע שכבר קיימת בקשר: הזן את האסמכתא (ObligationReference) או טוקן של הכרטיס.
      </p>

      <div>
        <label className="label">מה לייבא?</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("full")}
            className={`rounded-xl border-2 px-3 py-2 text-sm font-medium ${
              mode === "full"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            הוראה מלאה + עסקאות + כרטיס
          </button>
          <button
            type="button"
            onClick={() => setMode("card")}
            className={`rounded-xl border-2 px-3 py-2 text-sm font-medium ${
              mode === "card"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            💳 רק כרטיס אשראי
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {mode === "card"
            ? "יישמר רק הכרטיס (הטוקן) לאיש הקשר — ללא התחייבות וללא עסקאות."
            : "תיובא ההתחייבות, כל העסקאות שלה, והכרטיס. תשלומים חדשים ייקלטו אוטומטית."}
        </p>
      </div>

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
      {mode === "full" && (
        <div>
          <label className="label">סוג</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "income" | "expense")}>
            <option value="income">הכנסה</option>
            <option value="expense">הוצאה</option>
          </select>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "מייבא מקשר… (עד כחצי דקה)" : mode === "card" ? "💳 ייבא כרטיס" : "ייבא מקשר"}
        </button>
      </div>
    </form>
  );
}
