import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { specialDonationSchema } from "@/lib/schemas";

const GILYON = "גליון"; // the mainCategory that groups issues (גליונות)

const TX_SUCCESS = new Set([0, 4, 11, 22]);
const normalize = (s: string) => s.replace(/["'״\s]/g, "");
const isHokLaGilyon = (name?: string | null) => {
  const n = normalize(name ?? "");
  return n.includes("הוק") && n.includes("גליון");
};

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

  // Per-contact summary for the donors shown: obligation total, how much paid,
  // a הו"ק-לגליון flag, and their שיחות (across obligations/transactions).
  const contactIds = [...new Set(records.map((r) => r.contactId))];
  const [obligations, comms] = await Promise.all([
    prisma.obligation.findMany({
      where: { contactId: { in: contactIds } },
      include: { category: true, transactions: { select: { amount: true, statusCode: true } } },
    }),
    prisma.communication.findMany({
      where: {
        OR: [
          { obligation: { contactId: { in: contactIds } } },
          { transaction: { contactId: { in: contactIds } } },
        ],
      },
      include: { obligation: { select: { contactId: true } }, transaction: { select: { contactId: true } } },
      orderBy: { date: "desc" },
    }),
  ]);

  type Summary = {
    obligationTotal: number;
    paid: number;
    hasHok: boolean;
    communications: { date: Date; note: string }[];
  };
  const summaries: Record<number, Summary> = {};
  for (const cid of contactIds) summaries[cid] = { obligationTotal: 0, paid: 0, hasHok: false, communications: [] };
  for (const o of obligations) {
    if (o.contactId == null) continue;
    const s = summaries[o.contactId];
    if (!s) continue;
    s.obligationTotal += Number(o.recurringAmount);
    if (isHokLaGilyon(o.category?.category)) s.hasHok = true;
    for (const t of o.transactions) if (t.statusCode != null && TX_SUCCESS.has(t.statusCode)) s.paid += Number(t.amount);
  }
  for (const c of comms) {
    const cid = c.obligation?.contactId ?? c.transaction?.contactId;
    if (cid != null && summaries[cid]) summaries[cid].communications.push({ date: c.date, note: c.note });
  }

  return serialize({ records, gilyonot, latestGilyonId: gilyonot[0]?.id ?? null, contactSummaries: summaries });
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
