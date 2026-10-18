"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD, statusLabel } from "@/lib/constants";
import { PageHeader } from "@/components/ui";

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

  const atCurrent = month >= thisMonth();
  const bd = data?.breakdowns[period];

  return (
    <div>
      <PageHeader title="לוח בקרה" subtitle="סקירה חודשית — הכנסות, הוצאות ומגמות" />

      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <button className="btn-secondary !px-3" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹ הקודם
        </button>
        <input
          type="month"
          className="input max-w-[11rem] text-center"
          value={month}
          max={thisMonth()}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
        <button
          className="btn-secondary !px-3 disabled:opacity-40"
          disabled={atCurrent}
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
        >
          הבא ›
        </button>
      </div>

      {loading || !data ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : (
        <>
          {/* KPI cards (always monthly) */}
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
            <Kpi accent="bg-brand-500" label="אנשי קשר" value={String(data.kpis.contacts)} href="/contacts" />
            <Kpi accent="bg-indigo-500" label="התחייבויות חדשות" value={String(data.kpis.newObligations)} sub="לפי תאריך התחלה" />
            <Kpi accent="bg-emerald-500" label="עבר בהצלחה" value={formatCurrency(data.kpis.passedIncome.sum)} sub={`${data.kpis.passedIncome.count} עסקאות`} />
            <Kpi accent="bg-rose-500" label="לא עבר" value={formatCurrency(data.kpis.failedIncome.sum)} sub={`${data.kpis.failedIncome.count} עסקאות`} />
            <Kpi accent="bg-amber-500" label="הוצאות" value={formatCurrency(data.kpis.expenses.sum)} sub={`${data.kpis.expenses.count} עסקאות`} />
            <Kpi accent="bg-sky-500" label="צפוי לחודש הבא" value={formatCurrency(data.kpis.expectedNextMonth)} />
          </div>

          {/* Period toggle */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">פירוט לפי {period === "month" ? "החודש" : "השנה"}</h2>
            <div className="flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
              {(["month", "year"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg px-4 py-1.5 transition-colors ${period === p ? "bg-brand-600 text-white shadow" : "text-gray-500"}`}
                >
                  {p === "month" ? "חודש" : "שנה"}
                </button>
              ))}
            </div>
          </div>

          {bd && (
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <CategoryBars title="הכנסות לפי קטגוריה" rows={bd.incomeByCategory} color="bg-emerald-500" showFailed />
              <MethodList title="אמצעי תשלום — הכנסות" rows={bd.incomeByMethod} />
              <CategoryBars title="הוצאות לפי קטגוריה" rows={bd.expenseByCategory} color="bg-rose-500" />
              <MethodList title="אמצעי תשלום — הוצאות" rows={bd.expenseByMethod} />
              <SourceBox title={`מקור (${period === "month" ? "החודש" : "השנה"})`} rows={bd.bySource} />
            </div>
          )}

          {/* 12-month income trend */}
          <TrendChart trend={data.trend} />
        </>
      )}
    </div>
  );
}

function Kpi({ accent, label, value, sub, href }: { accent: string; label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="card overflow-hidden p-0">
      <div className={`h-1.5 ${accent}`} />
      <div className="p-4">
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-extrabold text-gray-800">{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition-transform hover:-translate-y-0.5">{body}</Link> : body;
}

function CategoryBars({ title, rows, color, showFailed }: { title: string; rows: CatRow[]; color: string; showFailed?: boolean }) {
  const max = Math.max(...rows.map((r) => r.sum), 1);
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-bold text-gray-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">אין נתונים</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="truncate font-medium text-gray-600">{r.name}</span>
                <span className="num font-semibold text-gray-700">
                  {formatCurrency(r.sum)}
                  {showFailed && r.failed ? <span className="mr-1 text-rose-500">✗ {formatCurrency(r.failed)}</span> : null}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(r.sum / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MethodList({ title, rows }: { title: string; rows: MethodRow[] }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-bold text-gray-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">אין נתונים</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.method} className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-600">{statusLabel(PAYMENT_METHOD, r.method)}</span>
              <span className="flex items-center gap-2">
                <span className="num font-semibold text-gray-700">{formatCurrency(r.sum)}</span>
                <span className="text-xs text-gray-400">({r.count}) · {r.pct}%</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceBox({ title, rows }: { title: string; rows: SourceRow[] }) {
  return (
    <div className="card p-5 lg:col-span-2">
      <h3 className="mb-3 text-sm font-bold text-gray-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">אין נתונים</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const total = r.passed + r.failed || 1;
            return (
              <div key={r.source} className="rounded-xl border border-gray-100 p-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-bold text-gray-700">{r.source}</span>
                  <span className="text-xs">
                    <span className="num font-semibold text-emerald-600">✓ {formatCurrency(r.passed)}</span>
                    {r.failed > 0 && <span className="num mr-2 font-semibold text-rose-500">✗ {formatCurrency(r.failed)}</span>}
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full bg-emerald-500" style={{ width: `${(r.passed / total) * 100}%` }} />
                  <div className="h-full bg-rose-500" style={{ width: `${(r.failed / total) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrendChart({ trend }: { trend: { ym: string; label: string; sum: number }[] }) {
  const max = Math.max(...trend.map((t) => t.sum), 1);
  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-bold text-gray-700">מגמת הכנסות — 12 חודשים אחרונים</h3>
      {/* Fixed-height row so the % bar heights resolve against a definite height. */}
      <div className="flex h-48 items-end gap-1.5">
        {trend.map((t) => (
          <div key={t.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={formatCurrency(t.sum)}>
            <div className="w-full text-center text-[9px] font-semibold text-gray-500">
              {t.sum > 0 ? Math.round(t.sum / 1000) + "k" : ""}
            </div>
            <div
              className="w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400"
              style={{ height: `${Math.max((t.sum / max) * 88, t.sum > 0 ? 2 : 0)}%` }}
            />
            <div className="text-[10px] text-gray-400">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
