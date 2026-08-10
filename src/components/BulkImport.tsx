"use client";

import { useState } from "react";
import { api } from "@/lib/client";

interface BulkResult {
  ok: boolean;
  message?: string;
  totalRows: number;
  matched: number;
  obligationsAdopted: number;
  transactionsImported: number;
  noContact: number;
  noData: number;
  details: { phone: string; reference: string; status: string }[];
  columns?: { phone: string; reference: string };
}

// Bulk-adopt obligations from a Kesher Excel (phone + אסמכתא), matching each
// phone to an existing contact. Shared by the contacts list and the income tab.
export function BulkImport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  async function run() {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
        fr.readAsDataURL(file);
      });
      const res = await api<BulkResult>("/api/obligations/bulk-adopt", {
        method: "POST",
        body: { fileBase64 },
      });
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="font-semibold">הייבוא הושלם ✓</div>
          <ul className="mt-1 space-y-0.5">
            <li>שורות בקובץ: {result.totalRows}</li>
            <li>קושרו והובאו: {result.matched}</li>
            <li>התחייבויות חדשות: {result.obligationsAdopted} · עסקאות שהובאו: {result.transactionsImported}</li>
            <li>לא נמצא איש קשר (טלפון): {result.noContact} · ללא עסקאות בקשר: {result.noData}</li>
          </ul>
        </div>
        {result.details.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 text-xs">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="th">טלפון</th>
                  <th className="th">אסמכתא</th>
                  <th className="th">תוצאה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.details.map((d, i) => (
                  <tr key={i}>
                    <td className="td">{d.phone}</td>
                    <td className="td">{d.reference}</td>
                    <td className="td text-gray-600">{d.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        העלה קובץ אקסל מקשר עם עמודות <b>טלפון</b> ו-<b>אסמכתא</b>. המערכת תזהה כל טלפון מול איש
        הקשר הקיים, ותייבא את ההתחייבות וכל העסקאות של אותה אסמכתא.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="input"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={run} disabled={!file || busy}>
          {busy ? "מייבא… (עד כדקה)" : "ייבא"}
        </button>
      </div>
    </div>
  );
}
