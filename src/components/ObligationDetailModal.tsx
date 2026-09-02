"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/client";
import { formatCurrency, formatMoney, formatDate } from "@/lib/format";
import { ObligationForm, type ObligationData, type SavedCard } from "@/components/ObligationForm";
import { TransactionForm, type TransactionData } from "@/components/TransactionForm";
import { TxStatusBadge, ConfirmButton } from "@/components/ui";

// A single popup that lets you edit an obligation AND manage every transaction
// belonging to it. Used from the contact profile (and reusable elsewhere).
export function ObligationDetailModal({
  obligation,
  transactions,
  contactId,
  contactCards = [],
  onChanged,
  onClose,
}: {
  obligation: ObligationData & { id: number };
  transactions: TransactionData[];
  contactId?: number | null;
  contactCards?: SavedCard[];
  onChanged: () => void; // reload parent data (keeps modal open)
  onClose: () => void; // close the whole popup
}) {
  const [tab, setTab] = useState<"details" | "transactions" | "communications">("details");
  // Which transaction is being added/edited inside the transactions tab.
  const [txEditing, setTxEditing] = useState<"new" | TransactionData | null>(null);
  // Charge-balance panel state.
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeCardId, setChargeCardId] = useState<number | "">(
    contactCards.find((c) => c.isDefault)?.id ?? contactCards[0]?.id ?? "",
  );
  const [chargeBusy, setChargeBusy] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);

  async function deleteTransaction(id: number) {
    await api(`/api/transactions/${id}`, { method: "DELETE" });
    onChanged();
  }

  const handled = Boolean((obligation as { handled?: boolean }).handled);
  const [handledBusy, setHandledBusy] = useState(false);
  async function toggleHandled() {
    setHandledBusy(true);
    try {
      await api(`/api/obligations/${obligation.id}`, { method: "PATCH", body: { handled: !handled } });
      onChanged();
    } finally {
      setHandledBusy(false);
    }
  }

  // Delete panel state.
  const isKesher = Boolean(obligation.kesherObligationReference);
  const hasCard = Boolean((obligation as { creditCardId?: number | null }).creditCardId);
  const [delOpen, setDelOpen] = useState(false);
  const [cancelInKesher, setCancelInKesher] = useState(false); // default: system-only
  const [removeCard, setRemoveCard] = useState(false); // default: keep card
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  async function deleteObligation() {
    setDelBusy(true);
    setDelError(null);
    try {
      const params = new URLSearchParams({
        kesherCancel: String(isKesher && cancelInKesher),
        removeCard: String(removeCard),
      });
      await api(`/api/obligations/${obligation.id}?${params.toString()}`, { method: "DELETE" });
      onClose();
    } catch (e) {
      setDelError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setDelBusy(false);
    }
  }

  const total = transactions.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const TX_SUCCESS = new Set([0, 4, 11, 22]);
  const paid = transactions
    .filter((t) => {
      const sc = (t as { statusCode?: number | null }).statusCode;
      return sc != null && TX_SUCCESS.has(sc);
    })
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const balance = Number((obligation as { recurringAmount?: number }).recurringAmount ?? 0) - paid;

  async function chargeBalance() {
    if (!chargeCardId) {
      setChargeError("יש לבחור כרטיס");
      return;
    }
    setChargeError(null);
    setChargeBusy(true);
    try {
      await api(`/api/obligations/${obligation.id}/charge-balance`, {
        method: "POST",
        body: { cardId: chargeCardId },
      });
      setChargeOpen(false);
      onChanged();
    } catch (e) {
      setChargeError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setChargeBusy(false);
    }
  }

  return (
    <div>
      {/* מטופל toggle + delete */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDelOpen((v) => !v)}
          className="rounded-full border border-red-200 bg-white px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          🗑 מחק התחייבות
        </button>
        <button
          type="button"
          onClick={toggleHandled}
          disabled={handledBusy}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
            handled
              ? "border-green-600 bg-green-600 text-white hover:bg-green-700"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {handled ? "✓ טופל" : "סמן כטופל"}
        </button>
      </div>

      {delOpen && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 p-4">
          <div className="mb-2 text-sm font-semibold text-red-700">מחיקת ההתחייבות</div>
          {isKesher ? (
            <div className="space-y-2 text-sm text-gray-700">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  checked={!cancelInKesher}
                  onChange={() => setCancelInKesher(false)}
                />
                <span>
                  <b>הסר מהמערכת בלבד</b> — ההוראה תישאר <b>פעילה בקשר</b> ותמשיך להתחייב שם.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  checked={cancelInKesher}
                  onChange={() => setCancelInKesher(true)}
                />
                <span>
                  <b>בטל בקשר וגם הסר מהמערכת</b> — ההוראה תבוטל בקשר (תפסיק לחייב).
                </span>
              </label>
            </div>
          ) : (
            <p className="text-sm text-gray-600">ההתחייבות תוסר מהמערכת.</p>
          )}

          {hasCard && (
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={removeCard} onChange={(e) => setRemoveCard(e.target.checked)} />
              מחק גם את הכרטיס מאיש הקשר (אם לא בשימוש בהתחייבות אחרת)
            </label>
          )}

          {delError && <p className="mt-2 text-xs text-red-600">{delError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-secondary !py-1.5 text-sm" onClick={() => setDelOpen(false)}>
              ביטול
            </button>
            <button className="btn-danger !py-1.5 text-sm" onClick={deleteObligation} disabled={delBusy}>
              {delBusy ? "מוחק…" : "מחק"}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        <TabBtn active={tab === "details"} onClick={() => setTab("details")}>
          פרטי התחייבות
        </TabBtn>
        <TabBtn active={tab === "transactions"} onClick={() => setTab("transactions")}>
          עסקאות ({transactions.length})
        </TabBtn>
        <TabBtn active={tab === "communications"} onClick={() => setTab("communications")}>
          שיחות
        </TabBtn>
      </div>

      {tab === "communications" ? (
        <CommunicationsSection obligationId={obligation.id} />
      ) : tab === "details" ? (
        <ObligationForm
          obligation={obligation}
          fixedContactId={contactId ?? undefined}
          fixedKind={(obligation.kind as "income" | "expense") ?? "income"}
          contactCards={contactCards}
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
            contactCards={contactCards}
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
              נגבה: <b className="text-green-700">{formatCurrency(paid)}</b>
              {balance > 0 && (
                <>
                  {" · "}יתרה: <b className="text-amber-600">{formatCurrency(balance)}</b>
                </>
              )}
            </span>
            <div className="flex gap-2">
              {balance > 0 && contactCards.length > 0 && (
                <button
                  className="btn-secondary !py-1.5 text-xs"
                  onClick={() => setChargeOpen((v) => !v)}
                >
                  💳 חייב יתרה בכרטיס
                </button>
              )}
              <button className="btn-secondary !py-1.5 text-xs" onClick={() => setTxEditing("new")}>
                + עסקה
              </button>
            </div>
          </div>

          {chargeOpen && balance > 0 && (
            <div className="mb-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
              <div className="mb-2 text-sm text-gray-600">
                חיוב יתרה של <b>{formatCurrency(balance)}</b> בכרטיס:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input max-w-[16rem]"
                  value={chargeCardId}
                  onChange={(e) => setChargeCardId(e.target.value ? Number(e.target.value) : "")}
                >
                  {contactCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brand ?? "כרטיס"} •••• {c.last4 ?? "????"}
                      {c.isDefault ? " (ברירת מחדל)" : ""}
                    </option>
                  ))}
                </select>
                <button className="btn-danger !py-1.5 text-xs" onClick={chargeBalance} disabled={chargeBusy}>
                  {chargeBusy ? "מחייב…" : `חייב ${formatCurrency(balance)}`}
                </button>
              </div>
              {chargeError && <p className="mt-2 text-xs text-red-600">{chargeError}</p>}
              <p className="mt-1 text-xs text-gray-400">חיוב בפועל בקשר; העסקה תירשם אוטומטית.</p>
            </div>
          )}
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
                      <td className="td font-medium">{formatMoney(t.amount, t.currency, t.amountIls)}</td>
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

interface Communication {
  id: number;
  date: string;
  note: string;
}

// שיחות — communication log for an obligation (or transaction).
export function CommunicationsSection({
  obligationId,
  transactionId,
}: {
  obligationId?: number;
  transactionId?: number;
}) {
  const [rows, setRows] = useState<Communication[]>([]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const query = obligationId ? `obligationId=${obligationId}` : `transactionId=${transactionId}`;

  const load = useCallback(async () => {
    setRows(await api<Communication[]>(`/api/communications?${query}`));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api("/api/communications", {
        method: "POST",
        body: { obligationId, transactionId, date, note },
      });
      setNote("");
      setDate(new Date().toISOString().slice(0, 10));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api(`/api/communications/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm text-gray-500">תאריך</label>
          <input
            type="date"
            className="input max-w-[10rem]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <textarea
          className="input"
          rows={2}
          placeholder="מה דיברת עם האדם…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button type="submit" className="btn-primary !py-1.5 text-sm" disabled={busy}>
            + הוסף שיחה
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">אין עדיין שיחות</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-lg border border-gray-200 px-3 py-2">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">{formatDate(c.date)}</span>
                <ConfirmButton
                  className="text-xs text-red-500 hover:underline"
                  message="למחוק שיחה זו?"
                  onConfirm={() => remove(c.id)}
                >
                  מחיקה
                </ConfirmButton>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{c.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
