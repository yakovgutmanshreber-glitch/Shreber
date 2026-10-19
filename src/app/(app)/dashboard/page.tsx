"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD, statusLabel } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";

interface CatRow { name: string; sum: number; failed?: number }
interface MethodRow { method: string; sum: number; count: number; pct: number }
interface SourceRow { source: string; passed: number; failed: number }
interface Breakdown {
  incomeByCategory: CatRow[];
  incomeByMethod: MethodRow[];
  expenseByCategory: CatRow[];
  expenseByMethod: MethodRow[];
  bySource: SourceRow[];
}
interface Dash {
  selectedMonth: string;
  isCurrentMonth: boolean;
  kpis: {
    contacts: number;
    newObligations: number;
    passedIncome: { sum: number; count: number };
    failedIncome: { sum: number; count: number };
    expenses: { sum: number; count: number };
    expectedNextMonth: number;
    kesherIncome: { sum: number; count: number };
    bankSettlement: { sum: number; count: number };
  };
  breakdowns: { month: Breakdown; year: Breakdown };
  trend: { ym: string; label: string; sum: number }[];
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function DashboardPage() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"month" | "year">("month");

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      setData(await api<Dash>(`/api/dashboard?month=${m}`));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load(month);
  }, [month, load]);

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="לוח בקרה" subtitle="מבט חודשי — הכנסות והוצאות" />
        <div className="card p-10 text-center text-slate-400">טוען…</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="לוח בקרה" subtitle="מבט חודשי — הכנסות והוצאות" />
        <EmptyState message="לא ניתן לטעון את הנתונים" />
      </div>
    );
  }

  const k = data.kpis;
  const atCurrent = month >= thisMonth();
  const isYear = period === "year";
  const periodLabel = isYear ? "השנה" : "החודש";
  const bd = data.breakdowns[period];
  const maxMonth = Math.max(1, ...data.trend.map((x) => x.sum));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="לוח בקרה" subtitle="מבט חודשי — הכנסות והוצאות" />
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary !px-2 !py-1" onClick={() => setMonth(shiftMonth(month, -1))} title="חודש קודם">
            ‹
          </button>
          <input type="month" className="input !w-auto" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} />
          <button type="button" className="btn-secondary !px-2 !py-1 disabled:opacity-40" disabled={atCurrent} onClick={() => setMonth(shiftMonth(month, 1))} title="חודש הבא">
            ›
          </button>
          {loading && <span className="text-xs text-slate-400">מעדכן…</span>}
        </div>
      </div>

      {/* summary boxes */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="אנשי קשר" value={String(k.contacts)} accent="from-brand-400 to-brand-600" href="/contacts" />
        <KpiCard label="התחייבויות חדשות" value={String(k.newObligations)} sub="החודש" accent="from-brand-400 to-brand-600" />
        <KpiCard label="עבר בהצלחה" value={formatCurrency(k.passedIncome.sum)} sub={`${k.passedIncome.count} תנועות · החודש`} accent="from-emerald-400 to-emerald-600" />
        <KpiCard label="לא עבר" value={formatCurrency(k.failedIncome.sum)} sub={`${k.failedIncome.count} תנועות · החודש`} accent="from-rose-400 to-rose-600" />
        <KpiCard label="הוצאות" value={formatCurrency(k.expenses.sum)} sub={`${k.expenses.count} תנועות · החודש`} accent="from-rose-400 to-rose-600" />
        <KpiCard label="סכום צפוי לחודש הבא" value={formatCurrency(k.expectedNextMonth)} accent="from-amber-400 to-amber-600" />
      </div>

      {/* Credit-card reconciliation: charged through Kesher vs. settled to the bank.
          Bank settlement deposits (ישראכרט…) are excluded from the income cards above
          so the same money isn't counted twice. */}
      {(k.kesherIncome.sum > 0 || k.bankSettlement.sum > 0) && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="mb-3 text-sm font-bold text-indigo-800">התאמת סליקת אשראי · החודש</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="התקבל דרך המערכת (קשר)"
              value={formatCurrency(k.kesherIncome.sum)}
              sub={`${k.kesherIncome.count} עסקאות אשראי`}
              accent="from-brand-400 to-brand-600"
            />
            <KpiCard
              label="התקבל בפועל מהבנק (סליקה)"
              value={formatCurrency(k.bankSettlement.sum)}
              sub={`${k.bankSettlement.count} הפקדות`}
              accent="from-emerald-400 to-emerald-600"
            />
            <KpiCard
              label="הפרש (קשר − בנק)"
              value={formatCurrency(k.kesherIncome.sum - k.bankSettlement.sum)}
              sub="כסף שחויב וטרם נגבה בבנק"
              accent="from-amber-400 to-amber-600"
            />
          </div>
        </div>
      )}

      {/* Period toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-800">פירוט לפי {periodLabel}</h2>
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {([["month", "חודש"], ["year", "שנה"]] as const).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setPeriod(val)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${period === val ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Income + expense breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBars title={`הכנסות לפי קטגוריה (${periodLabel})`} rows={bd.incomeByCategory} tone="emerald" />
        <MethodList title={`אמצעי תשלום (${periodLabel})`} rows={bd.incomeByMethod} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBars title={`הוצאות לפי קטגוריה (${periodLabel})`} rows={bd.expenseByCategory} tone="rose" />
        <MethodList title={`אמצעי תשלום (${periodLabel})`} rows={bd.expenseByMethod} />
      </div>

      {/* מקור — income passed/failed by processor */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SourceBox title={`מקור (${periodLabel})`} rows={bd.bySource} />
      </div>

      {/* 12-month income trend */}
      <div className="card p-5">
        <h3 className="mb-4 font-extrabold tracking-tight text-slate-800">הכנסות ב-12 החודשים האחרונים</h3>
        <div className="flex h-48 items-end gap-2">
          {data.trend.map((x) => (
            <div key={x.ym} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="num text-[10px] font-semibold text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
                {x.sum > 0 ? formatCurrency(x.sum) : ""}
              </div>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-brand-500 to-brand-300 transition-all hover:from-brand-600 hover:to-brand-400"
                style={{ height: `${Math.max(2, (x.sum / maxMonth) * 88)}%` }}
                title={`${x.label} — ${formatCurrency(x.sum)}`}
              />
              <div className="text-[10px] font-medium text-slate-500">{x.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, accent, href }: { label: string; value: string; sub?: string; accent: string; href?: string }) {
  const inner = (
    <div className="card relative h-full overflow-hidden p-5">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${accent}`} />
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="num mt-2 text-2xl font-extrabold text-slate-800">{value}</div>
      {sub && <div className="num mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function CategoryBars({ title, rows, tone }: { title: string; rows: CatRow[]; tone: "emerald" | "rose" }) {
  const max = Math.max(1, ...rows.map((r) => r.sum));
  const bar = tone === "emerald" ? "from-emerald-400 to-emerald-600" : "from-rose-400 to-rose-600";
  return (
    <div className="card p-5">
      <h3 className="mb-4 font-extrabold tracking-tight text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">אין נתונים</p>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.name}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-700">{c.name}</span>
                <span className="flex items-baseline gap-2">
                  {c.failed && c.failed > 0 ? (
                    <span className="num text-xs font-semibold text-rose-500">✗ {formatCurrency(c.failed)}</span>
                  ) : null}
                  <span className="num font-semibold text-slate-800">{formatCurrency(c.sum)}</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full bg-gradient-to-l ${bar}`} style={{ width: `${(c.sum / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MethodList({ title, rows }: { title: string; rows: MethodRow[] }) {
  const total = Math.max(1, rows.reduce((s, m) => s + m.sum, 0));
  return (
    <div className="card p-5">
      <h3 className="mb-4 font-extrabold tracking-tight text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">אין נתונים</p>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <div key={m.method} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                <span className="text-sm font-medium text-slate-700">{statusLabel(PAYMENT_METHOD, m.method)}</span>
                <span className="num text-xs text-slate-400">{m.count} תנועות</span>
              </div>
              <div className="text-left">
                <span className="num font-semibold text-slate-800">{formatCurrency(m.sum)}</span>
                <span className="num ms-2 text-xs text-slate-400">{Math.round((m.sum / total) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceBox({ title, rows }: { title: string; rows: SourceRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.passed + r.failed));
  return (
    <div className="card p-5">
      <h3 className="mb-4 font-extrabold tracking-tight text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">אין נתונים</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.source}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-700">{r.source}</span>
                <span className="flex items-baseline gap-2">
                  <span className="num font-semibold text-emerald-600">✓ {formatCurrency(r.passed)}</span>
                  {r.failed > 0 && <span className="num text-xs font-semibold text-rose-500">✗ {formatCurrency(r.failed)}</span>}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${(r.passed / max) * 100}%` }} />
                <div className="h-full bg-rose-400" style={{ width: `${(r.failed / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
