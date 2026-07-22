// Weekly Torah portion (parsha) helpers, built on @hebcal/core.
// Used by the תרומות מיוחדות feature to tag/group records by the Hebrew week.
import { HDate, Sedra, Locale } from "@hebcal/core";

// Use the Israeli reading schedule (matches ויזניץ).
const IL = true;

/** Remove Hebrew nikud/cantillation so "וָאֶתְחַנַּן" → "ואתחנן". */
export function stripNikud(s: string): string {
  return s.replace(/[֑-ׇ]/g, "");
}

export interface ParshaWeek {
  /** Hebrew parsha name without nikud, e.g. "ואתחנן" (joined for double parshiyot). */
  name: string;
  /** The week's Shabbat date (used for ordering + year disambiguation). */
  date: Date;
}

/** The parsha week for a given date (defaults to today). */
export function parshaForDate(date: Date = new Date()): ParshaWeek {
  const hd = new HDate(date);
  const sedra = new Sedra(hd.getFullYear(), IL);
  const p = sedra.lookup(hd);
  const parts = p.parsha ?? [];
  const name = parts.length
    ? parts.map((n) => stripNikud(Locale.gettext(n, "he"))).join("־")
    : "שבת/חג";
  // Shabbat date of this week (fallback to the given date if unavailable).
  let date2: Date = date;
  try {
    const sat = parts.length ? sedra.find(parts[0]) : null;
    if (sat) date2 = sat.greg();
  } catch {
    /* keep the given date */
  }
  return { name, date: date2 };
}

/** Current week's parsha. */
export function currentParsha(): ParshaWeek {
  return parshaForDate(new Date());
}
