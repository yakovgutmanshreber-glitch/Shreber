import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { KESHER_SUCCESS_CODES, PAYMENT_METHOD } from "@/lib/constants";

// GET /api/reports/category-statement?categoryId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// A קופה-style statement for one category over a DATE RANGE. Everything reflects
// the selected PERIOD: it counts the charges whose TRANSACTION DATE falls in the
// range, across ALL obligations in the category (any status — incl. cancelled —
// plus standalone category charges). Broken down by currency, by payment method,
// with passed / failed / total.

const CURRENCY_LABEL: Record<number, string> = {
  1: "שקל",
  2: "דולר",
  826: "פאונד",
  978: "אירו",
  124: "דולר קנדי",
  756: "פרנק שוויצרי",
};

type TxRow = {
  kind: string;
  amount: unknown;
  amountIls: unknown;
  currency: number;
  chargeOptionType: string | null;
  statusCode: number | null;
  obligationId: number | null;
};

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const categoryId = Number(sp.get("categoryId"));
  if (!categoryId) throw new ApiError("יש לבחור קטגוריה", 400);

  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(2000, 0, 1);
  // make the end inclusive (add a day)
  const to = sp.get("to")
    ? new Date(new Date(sp.get("to")!).getTime() + 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  const passed = (c: number | null) => c != null && KESHER_SUCCESS_CODES.has(c);

  // Every charge in the category whose transaction date is in the period — by the
  // transaction's own categoryId OR its obligation's category. Status-agnostic:
  // a charge on a now-cancelled hok still moved money in the period.
  const [category, charges] = await Promise.all([
    prisma.category.findUnique({ where: { id: categoryId }, select: { category: true } }),
    prisma.transaction.findMany({
      where: {
        transactionDate: { gte: from, lt: to },
        OR: [{ categoryId }, { obligation: { categoryId } }],
      },
      select: {
        kind: true,
        amount: true,
        amountIls: true,
        currency: true,
        chargeOptionType: true,
        statusCode: true,
        obligationId: true,
      },
    }),
  ]);

  function section(kind: "income" | "expense") {
    const set = (charges as TxRow[]).filter((t) => t.kind === kind);
    // Expense charges are all "paid" (recorded outflows); income counts only the
    // charges that settled. A failed income charge (explicit non-success) is owed.
    const isPaid = (t: TxRow) => kind === "expense" || passed(t.statusCode);
    const isFailed = (t: TxRow) => kind !== "expense" && !passed(t.statusCode) && t.statusCode != null;
    const paidTx = set.filter(isPaid);
    const failedTx = set.filter(isFailed);

    const ils = (t: TxRow) => Number(t.amountIls ?? t.amount);
    const paid = paidTx.reduce((s, t) => s + ils(t), 0); // ✓ עברו בהצלחה — cash in
    const failed = failedTx.reduce((s, t) => s + ils(t), 0); // ✗ לא עברו — bounced / owed
    const committed = paid + failed; // סך התחייבויות — total charged in the period

    // Distinct obligations that had a charge in the period.
    const oblIds = new Set(set.map((t) => t.obligationId).filter((x): x is number => x != null));

    const curMap = new Map<number, { paid: number; paidIls: number }>();
    for (const t of paidTx) {
      const e = curMap.get(t.currency) ?? { paid: 0, paidIls: 0 };
      e.paid += Number(t.amount);
      e.paidIls += ils(t);
      curMap.set(t.currency, e);
    }
    const byCurrency = [...curMap.entries()]
      .map(([currency, v]) => ({
        currency,
        label: CURRENCY_LABEL[currency] ?? String(currency),
        paid: Math.round(v.paid * 100) / 100,
        paidIls: Math.round(v.paidIls),
      }))
      .sort((a, b) => b.paidIls - a.paidIls);

    const methMap = new Map<string, number>();
    for (const t of paidTx) {
      const m = t.chargeOptionType || "אחר";
      methMap.set(m, (methMap.get(m) ?? 0) + ils(t));
    }
    const byMethod = [...methMap.entries()]
      .map(([method, amount]) => ({
        method,
        label: (PAYMENT_METHOD as Record<string, string>)[method] ?? method,
        amount: Math.round(amount),
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      count: oblIds.size, // מספר התחייבויות שנגבו בתקופה
      committed: Math.round(committed), // סך התחייבויות — total charged in the period
      payments: Math.round(paid), // סך תשלומים — collected in the period
      future: 0, // עתידי — not applicable to a closed period
      paid: Math.round(paid), // ✓ עברו בהצלחה
      failed: Math.round(failed), // ✗ לא עברו
      passedCount: paidTx.length,
      failedCount: failedTx.length,
      debt: Math.round(failed), // חוב (התחייבויות − שולם) = the bounced charges
      debtDue: Math.round(failed), // חוב לגבייה — same for a period report
      byCurrency,
      byMethod,
    };
  }

  return serialize({
    category: category?.category ?? "",
    income: section("income"),
    expense: section("expense"),
  });
});

export const maxDuration = 30;
// Always run fresh — the statement depends on query params, never cache it.
export const dynamic = "force-dynamic";
