import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { listOptionSchema } from "@/lib/schemas";

// GET all dropdown options (optionally ?key=leregel|donationType).
export const GET = handler(async (req) => {
  const key = new URL(req.url).searchParams.get("key");
  const rows = await prisma.listOption.findMany({
    where: key ? { listKey: key } : undefined,
    orderBy: { value: "asc" },
  });
  return serialize(rows);
});

// Add an option (idempotent — duplicates are ignored).
export const POST = handler(async (req) => {
  const body = await req.json();
  const { listKey, value } = listOptionSchema.parse(body);
  const row = await prisma.listOption.upsert({
    where: { listKey_value: { listKey, value } },
    create: { listKey, value },
    update: {},
  });
  return serialize(row);
});
