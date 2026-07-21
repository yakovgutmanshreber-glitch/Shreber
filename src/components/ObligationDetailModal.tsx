"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { ObligationForm, type ObligationData } from "@/components/ObligationForm";
import { TransactionForm, type TransactionData } from "@/components/TransactionForm";
import { TxStatusBadge, ConfirmButton } from "@/components/ui";

// A single popup that lets you edit an obligation AND manage every transaction
// belonging to it. Used from the contact profile (and reusable elsewhere).
export function ObligationDetailModal({
  obligation,
  transactions,
  contactId,
  onChanged,
  onClose,
}: {
  obligation: ObligationData & { id: number };
  transactions: TransactionData[];
  contactId?: number | null;
  onChanged: () => void; // reload parent data (keeps modal open)
  onClose: () => void; // close the whole popup
}) {
  const [tab, setTab] = useState<"details" | "transactions">("details");
  // Which transaction is being added/edited inside the transactions tab.
  const [txEditing, setTxEditing] = useState<"new" | TransactionData | null>(null);

  async function deleteTransaction(id: number) {
    await api(`/api/transactions/${id}`, { method: "DELETE" });
    onChanged();
  }

  const total = transactions.reduce((s, t) => s + Number(t.amount ?? 0), 0);

  return (
    <div>
      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        <TabBtn active={tab === "details"} onClick={() => setTab("details")}>
          פרטי התחייבות
        </TabBtn>
        <TabBtn active={tab === "transactions"} onClick={() => setTab("transactions")}>
          עסקאות ({transactions.length})
        </TabBtn>
      </div>

      {tab === "details" ? (
        <ObligationForm
          obligation={obligation}
          fixedContactId={contactId ?? undefined}
          onSaved={onChanged}
          onCancel={onClose}
        />
      ) : txEditing ? (
        <div>
          <button
            className="mb-3 text-sm text-brand-600 hover:underline"
            onClick={() => setTxEditing(null)}
          >
            ← חזרה לרשימת העסקאות
          </button>
          <TransactionForm
            transaction={txEditing === "new" ? undefined : txEditing}
            fixedContactId={contactId ?? undefined}
            fixedObligationId={obligation.id}
            fixedKind={(obligation.kind as "income" | "expense") ?? undefined}
            onSaved={() => {
              setTxEditing(null);
              onChanged();
            }}
            onCancel={() => setTxEditing(null)}
          />
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              סה״כ עסקאות: <b className="text-gray-800">{formatCurrency(total)}</b>
            </span>
            <button className="btn-secondary !py-1.5 text-xs" onClick={() => setTxEditing("new")}>
              + עסקה
            </button>
          </div>
          {transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">אין עסקאות להתחייבות זו</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="th">תאריך</th>
                    <th className="th">סכום</th>
                    <th className="th">מקור</th>
                    <th className="th">סטטוס</th>
                    <th className="th">הערה</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="td">{formatDate(t.transactionDate)}</td>
                      <td className="td font-medium">{formatCurrency(t.amount, t.currency)}</td>
                      <td className="td">{t.source === "api" ? "קשר" : "ידני"}</td>
                      <td className="td">
                        <TxStatusBadge
                          code={(t as { statusCode?: number | null }).statusCode}
                          text={(t as { statusText?: string | null }).statusText}
                        />
                      </td>
                      <td className="td text-gray-500">{t.comment ?? "—"}</td>
                      <td className="td text-left">
                        <button
                          className="text-sm text-brand-600 hover:underline"
                          onClick={() => setTxEditing(t)}
                        >
                          עריכה
                        </button>
                        <ConfirmButton
                          className="mr-3 text-sm text-red-600 hover:underline"
                          message="למחוק את העסקה?"
                          onConfirm={() => deleteTransaction(t.id!)}
                        >
                          מחיקה
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
