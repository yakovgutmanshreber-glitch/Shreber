import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Kesher internal status codes (spec §1 KesherStatus lookup table)
const KESHER_STATUSES: { code: number; description: string }[] = [
  { code: 1, description: "ממתין לשליחה" },
  { code: 2, description: "עסקה שבוטלה לפני שידור" },
  { code: 4, description: "עבר בהצלחה" },
  { code: 5, description: "נתונים שגויים" },
  { code: 6, description: "נכשל בשידור" },
  { code: 7, description: "בוטל" },
  { code: 8, description: "ממתין לסליקה" },
  { code: 9, description: "חזר" },
  { code: 10, description: "בבירור" },
  { code: 11, description: "עבר בהצלחה (וריאציה נוספת)" },
  { code: 14, description: "עסקה שלא עברה והוסרה מהדוח" },
  { code: 15, description: "נתונים שגויים" },
  { code: 16, description: "לא יסלק" },
  { code: 21, description: "ביט (ממתין לאישור המשלם)" },
  { code: 22, description: "אישור חלקי" },
  { code: 23, description: "עסקה שבוטלה בשידור יזום" },
];

const CATEGORIES: { mainCategory: string; category: string; defaultPrice: number }[] = [
  { mainCategory: "מנויים", category: "מנוי חודשי", defaultPrice: 100 },
  { mainCategory: "מנויים", category: "מנוי שנתי", defaultPrice: 1000 },
  { mainCategory: "תרומות", category: "תרומה חד פעמית", defaultPrice: 0 },
  { mainCategory: "תרומות", category: "הוראת קבע חודשית", defaultPrice: 50 },
  { mainCategory: "שירותים", category: "ייעוץ", defaultPrice: 300 },
  { mainCategory: "שירותים", category: "אחזקה", defaultPrice: 250 },
];

async function main() {
  console.log("Seeding KesherStatus…");
  for (const s of KESHER_STATUSES) {
    await prisma.kesherStatus.upsert({
      where: { code: s.code },
      update: { description: s.description },
      create: s,
    });
  }

  console.log("Seeding Categories…");
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { category: c.category },
      update: { mainCategory: c.mainCategory, defaultPrice: c.defaultPrice },
      create: c,
    });
  }

  console.log("Ensuring KesherSettings row…");
  const settings = await prisma.kesherSettings.findFirst();
  if (!settings) {
    await prisma.kesherSettings.create({ data: { projectNumber: "" } });
  }

  console.log("Seeding default admin user…");
  const adminEmail = "admin@example.com";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        displayName: "מנהל מערכת",
        role: "admin",
        passwordHash: await bcrypt.hash("admin1234", 10),
      },
    });
    console.log("  → admin@example.com / admin1234 (change this!)");
  }

  // A little demo data so the UI isn't empty on first run.
  const demoContactCount = await prisma.contact.count();
  if (demoContactCount === 0) {
    console.log("Seeding demo contact + obligation + transaction…");
    const category = await prisma.category.findFirst({ where: { category: "הוראת קבע חודשית" } });
    const contact = await prisma.contact.create({
      data: {
        firstName: "ישראל",
        lastName: "ישראלי",
        phone: "0501234567",
        email: "israel@example.com",
        city: "ירושלים",
      },
    });
    const obligation = await prisma.obligation.create({
      data: {
        kind: "income",
        contactId: contact.id,
        categoryId: category?.id ?? null,
        recurringAmount: 50,
        numPayments: 9999,
        chargeDay: 10,
        startDate: new Date(),
        status: "active",
        paymentMethod: "credit",
        comment: "הוראת קבע לדוגמה",
      },
    });
    await prisma.transaction.create({
      data: {
        obligationId: obligation.id,
        contactId: contact.id,
        source: "manual",
        amount: 50,
        currency: 1,
        transactionDate: new Date(),
        transactionType: "debit",
        chargeOptionType: "credit",
        statusCode: 4,
        statusText: "עבר בהצלחה",
        kind: "income",
        comment: "חיוב ראשון לדוגמה",
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
