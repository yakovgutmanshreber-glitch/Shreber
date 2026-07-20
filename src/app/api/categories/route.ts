import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { categorySchema } from "@/lib/schemas";

export const GET = handler(async () => {
  const categories = await prisma.category.findMany({
    orderBy: [{ mainCategory: "asc" }, { category: "asc" }],
  });
  return serialize(categories);
});

export const POST = handler(async (req) => {
  const body = await req.json();
  const data = categorySchema.parse(body);
  const category = await prisma.category.create({ data });
  return serialize(category);
});
