"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatMoney, formatCurrency, formatDate } from "@/lib/format";
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

function DebtsReport() {
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
            onClose={() => {
              setDetail(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}


// --- Reports hub -----------------------------------------------------------
type ReportKey = "debts" | "transactions";

const REPORTS: {
  key: ReportKey;
  title: string;
  subtitle: string;
  tint: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "debts",
    title: "חובות פתוחים",
    subtitle: "כל מה שנשאר לתשלום — עם אפשרות לרשום תשלום, לערוך או למחוק",
    tint: "bg-rose-50 text-rose-600",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M6 15h4" />
      </svg>
    ),
  },
  {
    key: "transactions",
    title: "עסקאות",
    subtitle: "כל התנועות לפי טווח תאריכים — מחולקות לעבר בהצלחה ולא עבר",
    tint: "bg-brand-50 text-brand-600",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 3 3 5-6" />
      </svg>
    ),
  },
];

export default function ReportsPage() {
  const [active, setActive] = useState<ReportKey | null>(null);
  const current = REPORTS.find((r) => r.key === active);

  if (active && current) {
    return (
      <div>
        <button
          onClick={() => setActive(null)}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
          חזרה לדוחות
        </button>
        <PageHeader title={current.title} subtitle={current.subtitle} />
        {active === "debts" ? <DebtsReport /> : <TransactionsReport />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="דוחות" subtitle="בחר דוח לצפייה" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setActive(r.key)}
            className="card group flex items-center gap-4 p-5 text-right transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${r.tint}`}>
              {r.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold tracking-tight text-slate-800">{r.title}</span>
              <span className="mt-0.5 block text-sm text-slate-500">{r.subtitle}</span>
            </span>
            <span className="text-slate-300 transition-colors group-hover:text-brand-500">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Transactions report ---------------------------------------------------
interface TxRow {
  id: number;
  date: string;
  contactId: number | null;
  name: string;
  category: string | null;
  amount: number;
  currency: number;
  amountIls: number | null;
  source: string;
  statusCode: number | null;
  statusText: string | null;
  passed: boolean;
}

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function TransactionsReport() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [view, setView] = useState<"passed" | "other">("passed");
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setRows(await api<TxRow[]>(`/api/reports/transactions?${params.toString()}`));
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const passed = rows.filter((r) => r.passed);
  const failed = rows.filter((r) => !r.passed);
  const sum = (list: TxRow[]) =>
    list.reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
  const shown = view === "passed" ? passed : failed;

  return (
    <div>
      {/* Date filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">מתאריך</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">עד תאריך</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card relative overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-brand-400 to-brand-600" />
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">סה״כ עסקאות</div>
          <div className="num mt-2 text-2xl font-extrabold text-slate-800">{formatCurrency(sum(rows))}</div>
          <div className="num mt-0.5 text-xs text-slate-400">{rows.length} תנועות</div>
        </div>
        <div className="card relative overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-400 to-emerald-600" />
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">עבר בהצלחה</div>
          <div className="num mt-2 text-2xl font-extrabold text-emerald-600">{formatCurrency(sum(passed))}</div>
          <div className="num mt-0.5 text-xs text-slate-400">{passed.length} תנועות</div>
        </div>
        <div className="card relative overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-rose-400 to-rose-600" />
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">הכל אחר</div>
          <div className="num mt-2 text-2xl font-extrabold text-rose-600">{formatCurrency(sum(failed))}</div>
          <div className="num mt-0.5 text-xs text-slate-400">{failed.length} תנועות</div>
        </div>
      </div>

      {/* Two tabs: passed vs everything else */}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button
          onClick={() => setView("passed")}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            view === "passed" ? "bg-white text-emerald-600 shadow-soft" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          עבר בהצלחה ({passed.length})
        </button>
        <button
          onClick={() => setView("other")}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            view === "other" ? "bg-white text-rose-600 shadow-soft" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          הכל אחר ({failed.length})
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-400">טוען…</div>
      ) : shown.length === 0 ? (
        <EmptyState message="אין עסקאות בטווח זה" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className="th">תאריך</th>
                <th className="th">שם</th>
                <th className="th">קטגוריה</th>
                <th className="th">סכום</th>
                <th className="th">מקור</th>
                <th className="th">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td num">{formatDate(t.date)}</td>
                  <td className="td font-medium">
                    {t.contactId ? (
                      <Link href={`/contacts/${t.contactId}`} className="text-brand-600 hover:underline">
                        {t.name}
                      </Link>
                    ) : (
                      t.name
                    )}
                  </td>
                  <td className="td text-slate-500">{t.category ?? "—"}</td>
                  <td className="td num font-semibold">{formatMoney(t.amount, t.currency, t.amountIls)}</td>
                  <td className="td text-slate-500">{t.source === "api" ? "קשר" : "ידני"}</td>
                  <td className="td">
                    {t.passed ? (
                      <span className="badge bg-emerald-50 text-emerald-600">עבר בהצלחה</span>
                    ) : (
                      <span className="badge bg-rose-50 text-rose-600">{t.statusText ?? "לא עבר"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
