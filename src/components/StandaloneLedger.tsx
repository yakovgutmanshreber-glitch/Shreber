"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { formatCurrency, formatMoney, formatDate } from "@/lib/format";
import { PAYMENT_METHOD, statusLabel } from "@/lib/constants";
import { Modal, PageHeader, ObligationStatusBadge, EmptyState } from "@/components/ui";
import { ObligationForm, type ObligationData } from "@/components/ObligationForm";
import { TransactionForm, type TransactionData } from "@/components/TransactionForm";
import { ObligationDetailModal } from "@/components/ObligationDetailModal";
import { BulkImport } from "@/components/BulkImport";

interface Obligation {
  id: number;
  recurringAmount: number;
  currency: number;
  amountIls: number | null;
  numPayments: number;
  status: string;
  paymentMethod: string;
  startDate: string;
  category: { category: string } | null;
  _count: { transactions: number };
}
interface Transaction {
  id: number;
  amount: number;
}
type ObligationDetail = ObligationData & {
  id: number;
  category?: { category: string } | null;
  transactions: TransactionData[];
};

export function StandaloneLedger({ kind }: { kind: "income" | "expense" }) {
  const title = kind === "income" ? "הכנסות" : "הוצאות";
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [oblOpen, setOblOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  // The obligation whose transactions are being viewed (fetched on click).
  const [detail, setDetail] = useState<ObligationDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [obl, tx] = await Promise.all([
      api<Obligation[]>(`/api/obligations?standalone=true&kind=${kind}`),
      api<Transaction[]>(`/api/transactions?standalone=true&kind=${kind}`),
    ]);
    setObligations(obl);
    setTransactions(tx);
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const openObligation = useCallback(async (id: number) => {
    const data = await api<ObligationDetail>(`/api/obligations/${id}`);
    setDetail({ ...data, transactions: data.transactions ?? [] });
  }, []);

  const reloadDetail = useCallback(async () => {
    if (!detail) return;
    const data = await api<ObligationDetail>(`/api/obligations/${detail.id}`);
    setDetail({ ...data, transactions: data.transactions ?? [] });
  }, [detail]);

  const totalObl = obligations
    .filter((o) => o.status === "active")
    .reduce((s, o) => s + Number(o.recurringAmount), 0);
  const totalTx = transactions.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`רשומות עצמאיות (ללא איש קשר) מסוג ${kind === "income" ? "הכנסה" : "הוצאה"}`}
        action={
          <div className="flex gap-2">
            {kind === "income" && (
              <button className="btn-secondary" onClick={() => setBulkOpen(true)}>
                🔗 ייבוא מרוכז מקשר (Excel)
              </button>
            )}
            <button className="btn-secondary" onClick={() => setOblOpen(true)}>
              + התחייבות
            </button>
            <button className="btn-primary" onClick={() => setTxOpen(true)}>
              + עסקה ידנית
            </button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <div className="text-sm text-gray-500">סה״כ התחייבויות פעילות (חודשי)</div>
          <div className="mt-1 text-2xl font-bold text-brand-600">{formatCurrency(totalObl)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-gray-500">סה״כ עסקאות</div>
          <div className="mt-1 text-2xl font-bold text-gray-800">{formatCurrency(totalTx)}</div>
        </div>
      </div>

      <div className="mb-3 text-sm text-gray-400">לחיצה על התחייבות מציגה את כל העסקאות שלה</div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : obligations.length === 0 ? (
        <EmptyState message="אין התחייבויות" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="th">קטגוריה</th>
                <th className="th">סכום</th>
                <th className="th">תשלומים</th>
                <th className="th">אמצעי</th>
                <th className="th">התחלה</th>
                <th className="th">עסקאות</th>
                <th className="th">סטטוס</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {obligations.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => openObligation(o.id)}
                >
                  <td className="td font-medium">{o.category?.category ?? "—"}</td>
                  <td className="td">{formatMoney(o.recurringAmount, o.currency, o.amountIls)}</td>
                  <td className="td">{o.numPayments === 9999 ? "ללא הגבלה" : o.numPayments}</td>
                  <td className="td">{statusLabel(PAYMENT_METHOD, o.paymentMethod)}</td>
                  <td className="td">{formatDate(o.startDate)}</td>
                  <td className="td">{o._count.transactions}</td>
                  <td className="td">
                    <ObligationStatusBadge status={o.status} />
                  </td>
                  <td className="td text-left text-brand-600">‹</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {kind === "income" && (
        <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="ייבוא מרוכז מקשר (Excel)" wide>
          <BulkImport mode="byCategory" onDone={load} />
        </Modal>
      )}
      <Modal open={oblOpen} onClose={() => setOblOpen(false)} title={`התחייבות ${title} חדשה`} wide>
        <ObligationForm
          fixedKind={kind}
          fixedContactId={null}
          onSaved={() => {
            setOblOpen(false);
            load();
          }}
          onCancel={() => setOblOpen(false)}
        />
      </Modal>
      <Modal open={txOpen} onClose={() => setTxOpen(false)} title={`עסקת ${title} חדשה`} wide>
        <TransactionForm
          fixedKind={kind}
          fixedContactId={null}
          obligations={obligations}
          onSaved={() => {
            setTxOpen(false);
            load();
          }}
          onCancel={() => setTxOpen(false)}
        />
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`התחייבות · ${detail?.category?.category ?? title}`}
        wide
      >
        {detail && (
          <ObligationDetailModal
            obligation={detail}
            transactions={detail.transactions}
            contactId={null}
            onChanged={() => {
              reloadDetail();
              load();
            }}
            onClose={() => setDetail(null)}
          />
        )}
      </Modal>
    </div>
  );
}
