import { NextResponse } from "next/server";
import { fetchAndStoreRates } from "@/lib/currency";

// Called by Vercel Cron each morning to refresh FX rates. Also callable manually.
export async function GET() {
  const result = await fetchAndStoreRates();
  return NextResponse.json(result);
}

export const maxDuration = 30;
