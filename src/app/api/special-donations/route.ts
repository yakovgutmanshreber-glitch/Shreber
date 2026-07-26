import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { specialDonationSchema } from "@/lib/schemas";

const GILYON = "גליון"; // the mainCategory that groups issues (גליונות)

export const GET = handler(async () => {
  const [records, gilyonot] = await Promise.all([
    prisma.specialDonation.findMany({
      orderBy: { createdAt: "desc" },
      include: { contact: true, category: true },
    }),
    prisma.category.findMany({
      where: { mainCategory: GILYON },
      orderBy: { createdAt: "desc" }, // latest גליון first
    }),
  ]);
  return serialize({ records, gilyonot, latestGilyonId: gilyonot[0]?.id ?? null });
});

export const POST = handler(async (req) => {
  const body = await req.json();
  const data = specialDonationSchema.parse(body);
  // Guard: the chosen category must actually be a גליון.
  const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!cat || cat.mainCategory !== GILYON) {
    throw new ApiError("יש לבחור גליון תקין (קטגוריה שהקטגוריה הראשית שלה 'גליון')", 400);
  }
  const row = await prisma.specialDonation.create({
    data: {
      contactId: data.contactId,
      categoryId: data.categoryId,
      occasion: data.occasion,
      amount: data.amount,
      donationType: data.donationType,
      entryDate: data.entryDate ?? new Date(),
      note: data.note,
    },
    include: { contact: true, category: true },
  });
  return serialize(row);
});
