import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";

// Parse a bank-export date. The file stores dates as text in M/D/YY (US) order,
// e.g. "10/18/26" → 18 Oct 2026. Also tolerates M/D/YYYY and a JS Date cell.
function parseDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, mo, da, yr] = m;
  let year = Number(yr);
  if (year < 100) year += 2000;
  // UTC midnight so the stored date keeps the same calendar day (no TZ shift),
  // matching how ISO date strings ("YYYY-MM-DD") are stored elsewhere in the app.
  const d = new Date(Date.UTC(year, Number(mo) - 1, Number(da)));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAmount(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

const normCat = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// POST /api/transactions/bank-import  { fileBase64 }
// Import a bank Excel into the הכנסות ledger as standalone income transactions.
// Columns (by header): תאריך, עבר מי, סכום, קטגוריה (קוטגריה typo accepted).
export const POST = handler(async (req) => {
  const { fileBase64 } = (await req.json()) as { fileBase64?: string };
  if (!fileBase64) throw new ApiError("לא התקבל קובץ", 400);

  const b64 = fileBase64.includes(",") ? fileBase64.split(",").pop()! : fileBase64;
  let json: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(b64, "base64"), { type: "buffer" });
    json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
  } catch {
    throw new ApiError("קריאת קובץ האקסל נכשלה", 400);
  }
  if (json.length === 0) throw new ApiError("הקובץ ריק", 400);

  const keys = Object.keys(json[0]);
  const col = (...subs: string[]) =>
    keys.find((key) => subs.some((s) => key.toLowerCase().includes(s.toLowerCase())));
  const dateKey = col("תאריך", "date");
  const fromKey = col("עבר מי", "עבר", "ממי", "מאת", "from", "תיאור");
  const amountKey = col("סכום", "זכות", "amount", "credit");
  const catKey = col("קטגור", "קוטג", "category");
  if (!dateKey || !amountKey) {
    throw new ApiError("לא נמצאו עמודות תאריך/סכום בקובץ", 400);
  }

  // Resolve categories: match existing by name, create the ones that are missing.
  const wantedCats = new Set<string>();
  for (const r of json) {
    const c = catKey ? String(r[catKey] ?? "").trim() : "";
    if (c) wantedCats.add(c);
  }
  const existingCats = await prisma.category.findMany({ select: { id: true, category: true } });
  const catByName = new Map<string, number>();
  for (const c of existingCats) catByName.set(normCat(c.category), c.id);
  for (const name of wantedCats) {
    if (catByName.has(normCat(name))) continue;
    const created = await prisma.category.create({
      data: { mainCategory: name, category: name },
    });
    catByName.set(normCat(name), created.id);
  }

  // Dedup against already-imported manual income (same day + amount + payer).
  const prior = await prisma.transaction.findMany({
    where: { kind: "income", source: "manual" },
    select: { transactionDate: true, amount: true, transferredTo: true },
  });
  const seen = new Set(
    prior.map(
      (t) =>
        `${t.transactionDate.toISOString().slice(0, 10)}|${Number(t.amount)}|${(t.transferredTo ?? "").trim()}`,
    ),
  );

  const toCreate: Record<string, unknown>[] = [];
  let skippedInvalid = 0;
  let skippedDup = 0;

  for (const r of json) {
    const date = parseDate(r[dateKey]);
    const amount = parseAmount(r[amountKey]);
    if (!date || !Number.isFinite(amount) || amount === 0) {
      skippedInvalid++;
      continue;
    }
    const transferredTo = fromKey ? String(r[fromKey] ?? "").trim() || null : null;
    const catName = catKey ? String(r[catKey] ?? "").trim() : "";
    const categoryId = catName ? (catByName.get(normCat(catName)) ?? null) : null;

    const key = `${date.toISOString().slice(0, 10)}|${amount}|${transferredTo ?? ""}`;
    if (seen.has(key)) {
      skippedDup++;
      continue;
    }
    seen.add(key);

    toCreate.push({
      kind: "income",
      source: "manual",
      amount,
      currency: 1,
      exchangeRate: 1,
      amountIls: amount,
      transactionDate: date,
      transactionType: "debit",
      chargeOptionType: "bank",
      statusCode: 4,
      statusText: "התקבל",
      transferredTo,
      categoryId,
    });
  }

  if (toCreate.length) await prisma.transaction.createMany({ data: toCreate as never });

  return serialize({
    ok: true,
    total: json.length,
    created: toCreate.length,
    skippedDup,
    skippedInvalid,
    newCategories: [...wantedCats].filter((n) => !existingCats.some((c) => normCat(c.category) === normCat(n))).length,
    columns: { date: dateKey, from: fromKey, amount: amountKey, category: catKey },
  });
});

export const maxDuration = 60;
