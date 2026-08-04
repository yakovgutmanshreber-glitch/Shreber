// Shared formatting helpers (Hebrew locale, ILS).

export function formatCurrency(value: number | string | null | undefined, currency = 1): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  const code = currencyIso(currency);
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}

export function currencyIso(currency: number): string {
  switch (currency) {
    case 2:
      return "USD";
    case 826:
      return "GBP";
    case 978:
      return "EUR";
    case 124:
      return "CAD";
    case 1:
    default:
      return "ILS";
  }
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

// Foreign amounts show their ₪ value in parentheses, e.g. "$100.00 (₪305.11)".
export function formatMoney(
  amount: number | string | null | undefined,
  currency = 1,
  amountIls?: number | string | null,
): string {
  const base = formatCurrency(amount, currency);
  if (currency !== 1 && amountIls != null && amountIls !== "") {
    return `${base} (${formatCurrency(amountIls, 1)})`;
  }
  return base;
}
