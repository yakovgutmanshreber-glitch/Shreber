"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatMoney, formatCurrency } from "@/lib/format";
import { Modal, PageHeader, EmptyState, ConfirmButton } from "@/components/ui";
import { ObligationDetailModal } from "@/components/ObligationDetailModal";
import type { ObligationData, SavedCard } from "@/components/ObligationForm";
import { TransactionForm, type TransactionData } from "@/components/TransactionForm";

interface Row {
  id: number;
  contactId: number | null;
  name: string;
  category: string | null;
  remaining: number;
  currency: number;
  comment: string | null;
  handled: boolean;
}
type ObligationDetail = ObligationData & {
  id: number;
  category?: { category: string } | null;
  transactions: TransactionData[];
};

export default function ReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [payRow, setPayRow] = useState<Row | null>(null);
  const [payCards, setPayCards] = useState<SavedCard[]>([]);
  const [detail, setDetail] = useState<ObligationDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await api<Row[]>("/api/reports/outstanding"));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = useCallback(async (id: number) => {
    const data = await api<ObligationDetail>(`/api/obligations/${id}`);
    setDetail({ ...data, transactions: data.transactions ?? [] });
  }, []);

  const openPay = useCallback(async (row: Row) => {
    let cards: SavedCard[] = [];
    if (row.contactId) {
      try {
        const c = await api<{ creditCards?: SavedCard[] }>(`/api/contacts/${row.contactId}`);
        cards = c.creditCards ?? [];
      } catch {
        /* no cards */
      }
    }
    setPayCards(cards);
    setPayRow(row);
  }, []);

  async function remove(id: number) {
    await api(`/api/obligations/${id}`, { method: "DELETE" });
    load();
  }

  const total = rows.reduce((s, r) => s + Number(r.remaining), 0);

  return (
    <div>
      <PageHeader title="דוחות" subtitle="חובות פתוחים — כל מה שנשאר לתשלום (נשאר > 0)" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <div className="text-sm text-gray-500">מספר חובות פתוחים</div>
          <div className="mt-1 text-2xl font-bold text-gray-800">{rows.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-gray-500">סה״כ נשאר לתשלום</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{formatCurrency(total)}</div>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : rows.length === 0 ? (
        <EmptyState message="אין חובות פתוחים 🎉" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="th">שם</th>
                <th className="th">קטגוריה</th>
                <th className="th">סכום</th>
                <th className="th">הערה</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-gray-50">
                  <td className="td font-medium">
                    <div className="flex items-center gap-2">
                      {r.contactId ? (
                        <Link href={`/contacts/${r.contactId}`} className="text-brand-600 hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                      {r.handled && (
                        <span className="badge bg-green-100 text-green-700">✓ טופל</span>
                      )}
                    </div>
                  </td>
                  <td className="td text-gray-500">{r.category ?? "—"}</td>
                  <td className="td font-semibold text-amber-600">
                    {formatMoney(r.remaining, r.currency)}
                  </td>
                  <td className="td max-w-[24rem] whitespace-pre-wrap text-gray-600">
                    {r.comment ?? "—"}
                  </td>
                  <td className="td text-left">
                    <div className="flex justify-end gap-3">
                      <button
                        className="text-sm font-medium text-green-600 hover:underline"
                        onClick={() => openPay(r)}
                      >
                        💰 שלם
                      </button>
                      <button
                        className="text-sm text-brand-600 hover:underline"
                        onClick={() => openEdit(r.id)}
                      >
                        עריכה
                      </button>
                      <ConfirmButton
                        className="text-sm text-red-600 hover:underline"
                        message={`למחוק את החוב של ${r.name}?`}
                        onConfirm={() => remove(r.id)}
                      >
                        מחיקה
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pay — full transaction form (credit card / cash / bank / check) */}
      <Modal open={!!payRow} onClose={() => setPayRow(null)} title={`רישום תשלום · ${payRow?.name ?? ""}`} wide>
        {payRow && (
          <TransactionForm
            transaction={{ amount: payRow.remaining, currency: payRow.currency }}
            fixedObligationId={payRow.id}
            fixedContactId={payRow.contactId}
            fixedKind="income"
            contactCards={payCards}
            onSaved={() => {
              setPayRow(null);
              load();
            }}
            onCancel={() => setPayRow(null)}
          />
        )}
      </Modal>

      {/* Full edit + transactions */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`התחייבות · ${detail?.category?.category ?? ""}`}
        wide
      >
        {detail && (
          <ObligationDetailModal
            obligation={detail}
            transactions={detail.transactions}
            contactId={detail.contactId ?? null}
            onChanged={() => {
              openEdit(detail.id);
              load();
            }}
            onClose={() => setDetail(null)}
          />
        )}
      </Modal>
    </div>
  );
}

