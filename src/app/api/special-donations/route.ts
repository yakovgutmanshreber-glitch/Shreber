import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { specialDonationSchema } from "@/lib/schemas";
import { currentParsha } from "@/lib/parsha";

export const GET = handler(async () => {
  const records = await prisma.specialDonation.findMany({
    orderBy: [{ parshaDate: "desc" }, { createdAt: "desc" }],
    include: { contact: true },
  });
  return serialize({ currentParsha: currentParsha().name, records });
});

export const POST = handler(async (req) => {
  const body = await req.json();
  const data = specialDonationSchema.parse(body);
  // Tag the record to the CURRENT parsha week (server-computed).
  const week = currentParsha();
  const row = await prisma.specialDonation.create({
    data: {
      contactId: data.contactId,
      occasion: data.occasion,
      amount: data.amount,
      donationType: data.donationType,
      entryDate: data.entryDate ?? new Date(),
      note: data.note,
      parsha: week.name,
      parshaDate: week.date,
    },
    include: { contact: true },
  });
  return serialize(row);
});
