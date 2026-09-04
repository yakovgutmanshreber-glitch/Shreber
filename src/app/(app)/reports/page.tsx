"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatMoney, formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD, statusLabel } from "@/lib/constants";
import { Modal, PageHeader, EmptyState, ConfirmButton, TxStatusBadge } from "@/components/ui";
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
type ReportKey = "debts" | "transactions" | "unlinked";

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
  {
    key: "unlinked",
    title: "רשומות ללא שיוך",
    subtitle: "התחייבויות ועסקאות שהתקבלו מקשר ולא זוהה להן איש קשר לפי טלפון",
    tint: "bg-amber-50 text-amber-600",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 17H7a5 5 0 0 1 0-10h2" />
        <path d="M15 7h2a5 5 0 0 1 4.5 7" />
        <path d="M8 12h4" />
        <path d="M18 22l4-4M22 22l-4-4" />
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
        {active === "debts" ? (
          <DebtsReport />
        ) : active === "transactions" ? (
          <TransactionsReport />
        ) : (
          <UnlinkedReport />
        )}
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

// --- Unlinked records report ----------------------------------------------
interface UnlinkedObl {
  id: number;
  reference: string | null;
  category: string | null;
  amount: number;
  currency: number;
  status: string;
  transactions: number;
  startDate: string;
  payerName: string | null;
  payerPhone: string | null;
  projectName: string | null;
}
interface UnlinkedTx {
  id: number;
  numTransaction: string | null;
  amount: number;
  currency: number;
  amountIls: number | null;
  date: string;
  statusCode: number | null;
  statusText: string | null;
  chargeOptionType: string | null;
  cardLast4: string | null;
  cardExpiry: string | null;
  authNum: string | null;
  receiptDocNumber: string | null;
  comment: string | null;
  payerName: string | null;
  payerPhone: string | null;
  projectName: string | null;
}
interface CategoryRow {
  id: number;
  mainCategory: string;
  category: string;
}
interface ContactHit {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

function UnlinkedReport() {
  const [data, setData] = useState<{ obligations: UnlinkedObl[]; transactions: UnlinkedTx[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<{ obligationId?: number; transactionId?: number; label: string } | null>(null);
  // Send-to-income (no customer) state.
  const [incomeTx, setIncomeTx] = useState<UnlinkedTx | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [incomeCat, setIncomeCat] = useState<string>("");
  const [incomeBusy, setIncomeBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await api("/api/reports/unlinked"));
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
    api<CategoryRow[]>("/api/categories").then(setCategories).catch(() => {});
  }, [load]);

  async function assign(contactId: number) {
    if (!pick) return;
    await api("/api/reports/unlinked", {
      method: "POST",
      body: { obligationId: pick.obligationId, transactionId: pick.transactionId, contactId },
    });
    setPick(null);
    load();
  }

  async function sendToIncome() {
    if (!incomeTx || !incomeCat) return;
    setIncomeBusy(true);
    try {
      await api("/api/reports/unlinked", {
        method: "POST",
        body: { transactionId: incomeTx.id, categoryId: Number(incomeCat) },
      });
      setIncomeTx(null);
      setIncomeCat("");
      load();
    } finally {
      setIncomeBusy(false);
    }
  }

  if (loading) return <div className="card p-8 text-center text-slate-400">טוען…</div>;
  const obls = data?.obligations ?? [];
  const txs = data?.transactions ?? [];
  if (obls.length === 0 && txs.length === 0)
    return <EmptyState message="הכול משויך — אין רשומות ללא איש קשר 🎉" />;

  return (
    <div className="space-y-6">
      {obls.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-500">התחייבויות ללא שיוך ({obls.length})</h3>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="th">אסמכתא</th>
                  <th className="th">שם</th>
                  <th className="th">טלפון</th>
                  <th className="th">פרויקט</th>
                  <th className="th">קטגוריה</th>
                  <th className="th">סכום</th>
                  <th className="th">עסקאות</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {obls.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="td num font-medium">{o.reference}</td>
                    <td className="td">{o.payerName ?? "—"}</td>
                    <td className="td num text-slate-500" dir="ltr">{o.payerPhone ?? "—"}</td>
                    <td className="td text-slate-500">{o.projectName ?? "—"}</td>
                    <td className="td text-slate-500">{o.category ?? "—"}</td>
                    <td className="td num">{formatMoney(o.amount, o.currency)}</td>
                    <td className="td num">{o.transactions}</td>
                    <td className="td text-left">
                      <button
                        className="btn-primary !py-1.5 text-xs"
                        onClick={() => setPick({ obligationId: o.id, label: `אסמכתא ${o.reference}` })}
                      >
                        שייך לאיש קשר
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {txs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-500">עסקאות ללא שיוך ({txs.length})</h3>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="th">תאריך</th>
                  <th className="th">מס׳ עסקה</th>
                  <th className="th">שם</th>
                  <th className="th">טלפון</th>
                  <th className="th">פרויקט</th>
                  <th className="th">סכום</th>
                  <th className="th">אמצעי</th>
                  <th className="th">כרטיס</th>
                  <th className="th">אישור</th>
                  <th className="th">סטטוס</th>
                  <th className="th">הערה</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txs.map((t) => (
                  <tr key={t.id} className="align-top hover:bg-slate-50">
                    <td className="td num whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="td num text-slate-500">{t.numTransaction ?? "—"}</td>
                    <td className="td whitespace-nowrap">{t.payerName ?? "—"}</td>
                    <td className="td num text-slate-500" dir="ltr">{t.payerPhone ?? "—"}</td>
                    <td className="td text-slate-500">{t.projectName ?? "—"}</td>
                    <td className="td num font-medium">{formatMoney(t.amount, t.currency, t.amountIls)}</td>
                    <td className="td text-slate-500">
                      {t.chargeOptionType ? statusLabel(PAYMENT_METHOD, t.chargeOptionType) : "—"}
                    </td>
                    <td className="td num text-slate-500" dir="ltr">
                      {t.cardLast4 ? `•••• ${t.cardLast4}${t.cardExpiry ? ` (${t.cardExpiry})` : ""}` : "—"}
                    </td>
                    <td className="td num text-slate-500">{t.authNum ?? "—"}</td>
                    <td className="td">
                      <TxStatusBadge code={t.statusCode} text={t.statusText} />
                    </td>
                    <td className="td max-w-[16rem] whitespace-pre-wrap text-slate-500">{t.comment ?? "—"}</td>
                    <td className="td text-left">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          className="text-xs font-medium text-emerald-600 hover:underline"
                          onClick={() => setIncomeTx(t)}
                        >
                          → רשום בהכנסות
                        </button>
                        <button
                          className="text-xs text-brand-600 hover:underline"
                          onClick={() => setPick({ transactionId: t.id, label: `עסקה ${t.numTransaction ?? t.id}` })}
                        >
                          שייך לאיש קשר
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!pick} onClose={() => setPick(null)} title={`שיוך ${pick?.label ?? ""} לאיש קשר`}>
        <ContactPicker onPick={assign} />
      </Modal>

      {/* Send transaction to הכנסות (no customer) */}
      <Modal open={!!incomeTx} onClose={() => setIncomeTx(null)} title="רישום העסקה בהכנסות (ללא איש קשר)">
        {incomeTx && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              העסקה על סך <b>{formatMoney(incomeTx.amount, incomeTx.currency, incomeTx.amountIls)}</b> תירשם
              כהכנסה עצמאית (ללא איש קשר) תחת הקטגוריה שתבחר, ותופיע בטאב הכנסות.
            </p>
            <div>
              <label className="label">קטגוריה</label>
              <select className="input" value={incomeCat} onChange={(e) => setIncomeCat(e.target.value)}>
                <option value="">— בחר קטגוריה —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.mainCategory} › {c.category}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setIncomeTx(null)}>
                ביטול
              </button>
              <button className="btn-primary" onClick={sendToIncome} disabled={incomeBusy || !incomeCat}>
                {incomeBusy ? "רושם…" : "רשום בהכנסות"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ContactPicker({ onPick }: { onPick: (contactId: number) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setHits([]);
        return;
      }
      setBusy(true);
      try {
        setHits(await api<ContactHit[]>(`/api/contacts?q=${encodeURIComponent(q.trim())}`));
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-3">
      <input
        className="input"
        placeholder="חיפוש איש קשר (שם או טלפון)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {busy ? (
        <p className="py-4 text-center text-sm text-slate-400">מחפש…</p>
      ) : hits.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">{q.trim() ? "לא נמצאו אנשי קשר" : "הקלד לחיפוש"}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {hits.slice(0, 30).map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onPick(c.id)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-right text-sm hover:border-brand-200 hover:bg-brand-50/40"
              >
                <span className="font-medium text-slate-800">
                  {c.firstName} {c.lastName ?? ""}
                </span>
                <span className="num text-xs text-slate-400" dir="ltr">{c.phone ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
