"use client";

import { useState } from "react";
import { api } from "@/lib/client";

interface ImportResult {
  fetched: number;
  created: number;
  updated: number;
  contactsCreated: number;
  obligationsCreated: number;
  skipped: number;
  ok: boolean;
  message?: string;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function KesherSyncPanel() {
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [createContacts, setCreateContacts] = useState(true);
  const [createObligations, setCreateObligations] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<ImportResult>("/api/kesher/sync", {
        method: "POST",
        body: { fromDate, toDate, createContacts, createObligations },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        משיכה יזומה של עסקאות מקשר לטווח תאריכים. הסנכרון השוטף מתבצע אוטומטית דרך ה-Webhook —
        זה נועד לייבוא ראשוני או השלמת נתונים.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">מתאריך</label>
          <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="label">עד תאריך</label>
          <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={createContacts} onChange={(e) => setCreateContacts(e.target.checked)} />
          צור אנשי קשר חסרים (לפי ClientReference)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={createObligations} onChange={(e) => setCreateObligations(e.target.checked)} />
          צור התחייבויות חסרות (לפי ObligationReference)
        </label>
      </div>
      <button className="btn-primary" onClick={run} disabled={loading}>
        {loading ? "מייבא…" : "משוך עסקאות מקשר"}
      </button>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="font-semibold">הייבוא הושלם ✓</div>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
            <li>נשלפו מקשר: {result.fetched}</li>
            <li>עסקאות חדשות: {result.created}</li>
            <li>עסקאות שעודכנו: {result.updated}</li>
            <li>אנשי קשר שנוצרו: {result.contactsCreated}</li>
            <li>התחייבויות שנוצרו: {result.obligationsCreated}</li>
            <li>דילוגים: {result.skipped}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
