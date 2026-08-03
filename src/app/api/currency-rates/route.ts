import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { fetchAndStoreRates } from "@/lib/currency";

export const GET = handler(async () =>
  serialize(await prisma.currencyRate.findMany({ orderBy: { code: "asc" } })),
);

// Manual refresh (admin-triggered from the UI).
export const POST = handler(async () => serialize(await fetchAndStoreRates()), { admin: true });
