import { NextResponse } from "next/server";
import { HDate, HebrewCalendar, flags } from "@hebcal/core";

// Strip Hebrew vowel points (nikud, U+0591–U+05C7) and any trailing year number.
const NIKUD = /[֑-ׇ]/g;
const clean = (s: string) => s.replace(NIKUD, "").replace(/\s*\d{4,}\s*$/, "").trim();

// GET /api/hebrew-date — today's Hebrew date + this week's parsha (or holiday).
export async function GET() {
  const hd = new HDate(new Date());
  const shabbat = hd.onOrAfter(6); // upcoming Saturday
  const events = HebrewCalendar.calendar({ start: shabbat, end: shabbat, sedrot: true, il: true });
  const parsha = events.find((e) => e.getFlags() & flags.PARSHA_HASHAVUA);
  const holiday = events.find((e) => e.getFlags() & (flags.CHAG | flags.MAJOR_FAST));
  const label = parsha ? clean(parsha.render("he")) : holiday ? clean(holiday.render("he")) : null;
  return NextResponse.json({ date: clean(hd.renderGematriya()), label });
}

export const revalidate = 3600; // recompute at most hourly
