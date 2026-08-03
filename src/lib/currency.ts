import { prisma } from "@/lib/prisma";
import { CURRENCY_CODE } from "@/lib/constants";

const SYMBOLS = ["USD", "EUR", "GBP", "CAD"];

/** Fetch today's rates (foreign -> ILS) from a free API and upsert them. */
export async function fetchAndStoreRates(): Promise<{ ok: boolean; updated: number; message?: string }> {
  try {
    // frankfurter.app: 1 ILS = rates[X] units of X → invert to get X -> ILS.
    const url = `https://api.frankfurter.app/latest?from=ILS&to=${SYMBOLS.join(",")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, updated: 0, message: `HTTP ${res.status}` };
    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const rates = data.rates ?? {};
    const date = data.date ? new Date(data.date) : new Date();
    let updated = 0;
    for (const code of SYMBOLS) {
      const perIls = rates[code];
      if (!perIls || perIls <= 0) continue;
      const rateToIls = 1 / perIls; // ILS per 1 unit of `code`
      await prisma.currencyRate.upsert({
        where: { code },
        create: { code, rateToIls, date },
        update: { rateToIls, date },
      });
      updated++;
    }
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, updated: 0, message: e instanceof Error ? e.message : "fetch error" };
  }
}

/** Convert an amount in a numeric currency code to ILS using stored rates. */
export async function convertToIls(
  amount: number,
  currencyNum: number,
): Promise<{ exchangeRate: number | null; amountIls: number | null }> {
  const code = CURRENCY_CODE[currencyNum] ?? "ILS";
  if (code === "ILS") return { exchangeRate: 1, amountIls: amount };
  const row = await prisma.currencyRate.findUnique({ where: { code } });
  if (!row) return { exchangeRate: null, amountIls: null };
  const rate = Number(row.rateToIls);
  return { exchangeRate: rate, amountIls: amount * rate };
}
