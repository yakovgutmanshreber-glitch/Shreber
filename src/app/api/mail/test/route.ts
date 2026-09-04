import { handler } from "@/lib/api";
import { sendMail, notifyRecipient } from "@/lib/mail";

// POST /api/mail/test — send a test reminder email to confirm SMTP works.
export const POST = handler(async () => {
  const to = notifyRecipient();
  await sendMail({
    to,
    subject: "בדיקת מייל — מערכת המשימות",
    text: "זהו מייל בדיקה. אם קיבלת אותו, שליחת התזכורות מוגדרת כראוי. ✅",
    html: `<div dir="rtl" style="font-family:Arial;font-size:15px">זהו מייל בדיקה. אם קיבלת אותו, שליחת התזכורות מוגדרת כראוי. ✅</div>`,
  });
  return { ok: true, to };
}, { admin: true });
