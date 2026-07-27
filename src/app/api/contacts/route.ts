import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { contactSchema } from "@/lib/schemas";
import { rememberOption } from "@/lib/list-options";

export const GET = handler(async (req) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const where = q
    ? {
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
          { city: { contains: q } },
        ],
      }
    : {};
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { obligations: true, transactions: true } } },
  });
  return serialize(contacts);
});

export const POST = handler(async (req) => {
  const body = await req.json();
  const data = contactSchema.parse(body);
  const contact = await prisma.contact.create({ data });
  await rememberOption("city", data.city);
  await rememberOption("country", data.country);
  return serialize(contact);
});
