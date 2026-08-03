"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/format";

interface Rate {
  code: string;
  rateToIls: number;
  date: string;
}
const LABEL: Record<string, string> = {
  USD: "דולר אמריקאי",
  EUR: "יורו",
  GBP: "לירה שטרלינג",
  CAD: "דולר קנדי",
};

export function CurrencyRatesPanel() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setRates(await api<Rate[]>("/api/currency-rates")), []);
  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    try {
      await api("/api/currency-rates", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">מתעדכן אוטומטית כל בוקר · ₪ לכל יחידת מטבע</p>
        <button className="btn-secondary !py-1.5 text-xs" onClick={refresh} disabled={busy}>
          {busy ? "מרענן…" : "רענן עכשיו"}
        </button>
      </div>
      {rates.length === 0 ? (
        <p className="text-sm text-gray-400">אין שערים עדיין — לחץ "רענן עכשיו"</p>
      ) : (
        <table className="w-full">
          <thead className="border-b border-gray-200">
            <tr>
              <th className="th">מטבע</th>
              <th className="th">שער (₪)</th>
              <th className="th">תאריך</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rates.map((r) => (
              <tr key={r.code}>
                <td className="td font-medium">
                  {LABEL[r.code] ?? r.code} ({r.code})
                </td>
                <td className="td">{Number(r.rateToIls).toFixed(4)}</td>
                <td className="td text-gray-500">{formatDate(r.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
