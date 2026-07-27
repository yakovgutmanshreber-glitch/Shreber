import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { contactSchema } from "@/lib/schemas";
import { rememberOption } from "@/lib/list-options";

async function getId(ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("מזהה לא תקין", 400);
  return n;
}

export const GET = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      obligations: { include: { category: true }, orderBy: { createdAt: "desc" } },
      transactions: {
        include: { obligation: true },
        orderBy: { transactionDate: "desc" },
      },
      creditCards: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!contact) throw new ApiError("איש קשר לא נמצא", 404);
  return serialize(contact);
});

export const PATCH = handler(async (req, ctx) => {
  const id = await getId(ctx);
  const body = await req.json();
  const data = contactSchema.partial().parse(body);
  const contact = await prisma.contact.update({ where: { id }, data });
  await rememberOption("city", data.city);
  await rememberOption("country", data.country);
  return serialize(contact);
});

export const DELETE = handler(async (_req, ctx) => {
  const id = await getId(ctx);
  await prisma.contact.delete({ where: { id } });
  return { ok: true };
});
