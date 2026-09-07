"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Modal, PageHeader, EmptyState } from "@/components/ui";

interface SentEmail {
  id: number;
  to: string;
  subject: string;
  html: string | null;
  kind: string;
  status: string;
  error: string | null;
  createdAt: string;
  contactId: number | null;
  contactName: string | null;
}

const KIND_LABEL: Record<string, string> = {
  email: "מייל",
  task: "תזכורת משימה",
  test: "בדיקה",
};

export default function SentEmailsPage() {
  const [rows, setRows] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<SentEmail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await api<SentEmail[]>("/api/sent-emails"));
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="מיילים שנשלחו" subtitle="יומן כל המיילים שנשלחו מהמערכת" />

      {loading ? (
        <div className="card p-8 text-center text-slate-400">טוען…</div>
      ) : rows.length === 0 ? (
        <EmptyState message="עדיין לא נשלחו מיילים" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className="th">תאריך</th>
                <th className="th">אל</th>
                <th className="th">איש קשר</th>
                <th className="th">נושא</th>
                <th className="th">סוג</th>
                <th className="th">סטטוס</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td num whitespace-nowrap text-slate-500">{formatDateTime(r.createdAt)}</td>
                  <td className="td num text-slate-600" dir="ltr">{r.to}</td>
                  <td className="td">
                    {r.contactId ? (
                      <Link href={`/contacts/${r.contactId}`} className="text-brand-600 hover:underline">
                        {r.contactName ?? `#${r.contactId}`}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td font-medium text-slate-800">{r.subject}</td>
                  <td className="td text-slate-500">{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className="td">
                    {r.status === "sent" ? (
                      <span className="badge bg-emerald-100 text-emerald-700">נשלח</span>
                    ) : (
                      <span className="badge bg-rose-100 text-rose-700" title={r.error ?? ""}>נכשל</span>
                    )}
                  </td>
                  <td className="td text-left">
                    {r.html && (
                      <button className="text-sm text-brand-600 hover:underline" onClick={() => setView(r)}>
                        צפה
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.subject ?? ""} wide>
        {view && (
          <div>
            <div className="mb-3 text-xs text-slate-500">
              אל <b dir="ltr">{view.to}</b> · {formatDateTime(view.createdAt)}
            </div>
            <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: "65vh" }}>
              <div dangerouslySetInnerHTML={{ __html: view.html ?? "" }} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
