// "שמחות" — a mazal-tov card email. Pure (no server deps) so both the client
// preview and the send flow use the same builder. Styles are inlined so email
// clients (Gmail) render it reliably.

export const SIMCHA_SUBJECT = "בברכת מזל טוב";

// Occasion phrases for the card's highlight line (a second line "בשעה טובה
// ומוצלחת" is appended automatically).
export const SIMCHA_OCCASIONS: string[] = [
  "לרגל שמחת אירוסי בנו",
  "לרגל שמחת אירוסי בתו",
  "לרגל שמחת נישואי בנו",
  "לרגל שמחת נישואי בתו",
  "לרגל שמחת הולדת הבן",
  "לרגל שמחת הולדת הבת",
  "לרגל שמחת הברית",
  "לרגל שמחת הבר מצווה",
  "לרגל הכנסו לעול תורה ומצוות",
  "לרגל שמחת חנוכת הבית",
];

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

export function simchaCardHtml({ name, occasion }: { name: string; occasion: string }): string {
  const font = "'Frank Ruhl Libre', Georgia, 'Times New Roman', serif";
  return `<div dir="rtl" style="background:#f5f3ef;padding:40px 20px;font-family:${font};">
  <div style="background:#ffffff;max-width:650px;margin:0 auto;padding:50px 40px;border:2px solid #c5a059;box-sizing:border-box;text-align:center;color:#2b2b2b;">
    <div style="border:1px solid #d4af37;padding:40px 30px;">
      <div style="font-size:14px;letter-spacing:1px;color:#666;margin-bottom:5px;">דברי אלקים חיים</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:20px;">ב"ה</div>
      <div style="width:60px;height:1px;background:#c5a059;margin:0 auto 25px auto;"></div>
      <div style="font-size:17px;color:#555;margin-bottom:6px;">כבוד ידידנו היקר והנכבד</div>
      <div style="font-size:28px;font-weight:900;color:#1a1a1a;margin-bottom:25px;">${esc(name)}</div>
      <div style="font-size:16px;line-height:1.6;color:#444;margin-bottom:25px;font-style:italic;">ברחשי אחוה ושותפות, מבין כתלי בית חיינו נקודת לבבינו,<br>הננו להביע ברכתנו הנאמנה</div>
      <div style="font-size:32px;font-weight:900;color:#a32a2a;margin:20px 0 10px 0;letter-spacing:1px;">בברכת מזל טוב</div>
      <div style="font-size:24px;font-weight:700;color:#a32a2a;margin-bottom:10px;">חמה ולבבית</div>
      <div style="font-size:19px;font-weight:700;color:#333;margin-bottom:25px;">${esc(occasion)}<br>בשעה טובה ומוצלחת</div>
      <div style="width:60px;height:1px;background:#c5a059;margin:0 auto 25px auto;"></div>
      <div style="font-size:16px;line-height:1.8;color:#333;margin-bottom:10px;">
        <p style="margin:6px 0;">ברכת רבנו הק' תלווהו ותעטרהו בשפע ברכה והצלחה ושמירה עליונה,</p>
        <p style="margin:6px 0;">אושר ועושר, נחת דקדושה עם כל מילי דמיטב לאורך ימים ושנים טובות,</p>
        <p style="margin:6px 0;">בשמחת הלב והרחבת הדעת ושלוות הנפש,</p>
        <p style="margin:6px 0;">ותדיר נבשר לפני רבנו הק' שליט"א אך בשורות טובות ומשמחות</p>
      </div>
      <div style="margin-top:30px;font-size:17px;font-weight:700;color:#c5a059;border-top:1px solid #f0e6d2;padding-top:20px;">בברכת הידידים</div>
    </div>
  </div>
</div>`;
}
