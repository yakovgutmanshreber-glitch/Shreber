import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { KESHER_SUCCESS_CODES } from "@/lib/constants";

// ---------------------------------------------------------------------------
// GET /api/dashboard?month=YYYY-MM — monthly overview: KPI cards (always for the
// selected month), breakdowns for both the month and the calendar year (the
// client toggles between them), a per-source split, and a 12-month income trend.
// All money is summed in ₪ via each transaction's amountIls (converted amount).
// ---------------------------------------------------------------------------

const ils = (t: { amountIls: unknown; amount: unknown }) =>
  Number(t.amountIls ?? t.amount ?? 0);
const passed = (code: number | null) => code != null && KESHER_SUCCESS_CODES.has(code);
const sourceLabel = (source: string) => (source === "manual" ? "ידני" : "קשר");

const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

interface Tx {
  amount: unknown;
  amountIls: unknown;
  statusCode: number | null;
  chargeOptionType: string;
  transactionDate: Date;
  kind: string;
  source: string;
  categoryId: number | null;
  category: { category: string } | null;
  obligation: { category: { category: string } | null } | null;
}

const catName = (t: Tx) =>
  t.category?.category ?? t.obligation?.category?.category ?? "ללא קטגוריה";

function topGroups(txs: Tx[], valueOf: (t: Tx) => number, limit = 10) {
  const m = new Map<string, number>();
  for (const t of txs) m.set(catName(t), (m.get(catName(t)) ?? 0) + valueOf(t));
  return [...m.entries()]
    .map(([name, sum]) => ({ name, sum }))
    .filter((r) => r.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .slice(0, limit);
}

function byMethod(txs: Tx[]) {
  const m = new Map<string, { sum: number; count: number }>();
  for (const t of txs) {
    const e = m.get(t.chargeOptionType) ?? { sum: 0, count: 0 };
    e.sum += ils(t);
    e.count += 1;
    m.set(t.chargeOptionType, e);
  }
  const total = [...m.values()].reduce((s, e) => s + e.sum, 0) || 1;
  return [...m.entries()]
    .map(([method, e]) => ({ method, sum: e.sum, count: e.count, pct: Math.round((e.sum / total) * 100) }))
    .sort((a, b) => b.sum - a.sum);
}

function breakdown(txs: Tx[]) {
  const incomeOk = txs.filter((t) => t.kind === "income" && passed(t.statusCode));
  const incomeFail = txs.filter((t) => t.kind === "income" && !passed(t.statusCode));
  const expense = txs.filter((t) => t.kind === "expense");

  // Income by category with each category's failed (לא עבר) amount.
  const failByCat = new Map<string, number>();
  for (const t of incomeFail) failByCat.set(catName(t), (failByCat.get(catName(t)) ?? 0) + ils(t));
  const incomeByCategory = topGroups(incomeOk, ils).map((r) => ({ ...r, failed: failByCat.get(r.name) ?? 0 }));

  // Income by source (processor): passed + failed split.
  const srcMap = new Map<string, { passed: number; failed: number }>();
  for (const t of txs.filter((x) => x.kind === "income")) {
    const key = sourceLabel(t.source);
    const e = srcMap.get(key) ?? { passed: 0, failed: 0 };
    if (passed(t.statusCode)) e.passed += ils(t);
    else e.failed += ils(t);
    srcMap.set(key, e);
  }
  const bySource = [...srcMap.entries()]
    .map(([source, e]) => ({ source, ...e }))
    .sort((a, b) => b.passed + b.failed - (a.passed + a.failed));

  return {
    incomeByCategory,
    incomeByMethod: byMethod(incomeOk),
    expenseByCategory: topGroups(expense, ils),
    expenseByMethod: byMethod(expense),
    bySource,
  };
}

export const GET = handler(async (req) => {
  const monthParam = new URL(req.url).searchParams.get("month");
  const now = new Date();
  const [y, mo] = monthParam?.match(/^(\d{4})-(\d{2})$/)
    ? [Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)) - 1]
    : [now.getFullYear(), now.getMonth()];

  const monthStart = new Date(y, mo, 1);
  const monthEnd = new Date(y, mo + 1, 1);
  const yearStart = new Date(y, 0, 1);
  const yearEnd = new Date(y + 1, 0, 1);
  const trendStart = new Date(y, mo - 11, 1); // 12 months ending at the selected month
  const windowStart = trendStart < yearStart ? trendStart : yearStart;
  const windowEnd = monthEnd > yearEnd ? monthEnd : yearEnd;

  const [contacts, txRows, obligations] = await Promise.all([
    prisma.contact.count(),
    prisma.transaction.findMany({
      where: { transactionDate: { gte: windowStart, lt: windowEnd } },
      select: {
        amount: true, amountIls: true, statusCode: true, chargeOptionType: true,
        transactionDate: true, kind: true, source: true, categoryId: true,
        category: { select: { category: true } },
        obligation: { select: { category: { select: { category: true } } } },
      },
    }),
    prisma.obligation.findMany({
      where: { kind: "income" },
      select: {
        recurringAmount: true, amountIls: true, numPayments: true, chargeType: true,
        status: true, startDate: true,
        transactions: { select: { amountIls: true, amount: true, statusCode: true } },
      },
    }),
  ]);

  const txs = txRows as unknown as Tx[];
  const inMonth = (t: Tx) => t.transactionDate >= monthStart && t.transactionDate < monthEnd;
  const inYear = (t: Tx) => t.transactionDate >= yearStart && t.transactionDate < yearEnd;

  // --- KPI cards (selected month) ---
  const monthIncome = txs.filter((t) => t.kind === "income" && inMonth(t));
  const monthExpense = txs.filter((t) => t.kind === "expense" && inMonth(t));
  const okIncome = monthIncome.filter((t) => passed(t.statusCode));
  const failIncome = monthIncome.filter((t) => !passed(t.statusCode));

  const newObligations = obligations.filter(
    (o) => o.startDate >= monthStart && o.startDate < monthEnd && o.status !== "cancelled",
  ).length;

  // Expected next month: one period per active income obligation that still owes.
  let expectedNextMonth = 0;
  for (const o of obligations) {
    if (o.status !== "active") continue;
    const one = Number(o.amountIls ?? o.recurringAmount ?? 0);
    if (one <= 0) continue;
    const collected = o.transactions
      .filter((t) => passed(t.statusCode))
      .reduce((s, t) => s + Number(t.amountIls ?? t.amount ?? 0), 0);
    const n = Number(o.numPayments ?? 1);
    if (o.chargeType === "onetime" || n <= 1) {
      if (collected < one) expectedNextMonth += one;
    } else if (n >= 9999) {
      expectedNextMonth += one; // ongoing recurring
    } else if (collected < one * n) {
      expectedNextMonth += one; // finite recurring / installments still owing
    }
  }

  // --- 12-month trend (successful income) ---
  const trend = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, mo - 11 + i, 1);
    const next = new Date(y, mo - 11 + i + 1, 1);
    const sum = txs
      .filter((t) => t.kind === "income" && passed(t.statusCode) && t.transactionDate >= d && t.transactionDate < next)
      .reduce((s, t) => s + ils(t), 0);
    return { ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: HEB_MONTHS[d.getMonth()], sum };
  });

  const sum = (arr: Tx[]) => arr.reduce((s, t) => s + ils(t), 0);

  return serialize({
    selectedMonth: `${y}-${String(mo + 1).padStart(2, "0")}`,
    isCurrentMonth: y === now.getFullYear() && mo === now.getMonth(),
    kpis: {
      contacts,
      newObligations,
      passedIncome: { sum: sum(okIncome), count: okIncome.length },
      failedIncome: { sum: sum(failIncome), count: failIncome.length },
      expenses: { sum: sum(monthExpense), count: monthExpense.length },
      expectedNextMonth,
    },
    breakdowns: {
      month: breakdown(txs.filter(inMonth)),
      year: breakdown(txs.filter(inYear)),
    },
    trend,
  });
});

export const maxDuration = 60;
