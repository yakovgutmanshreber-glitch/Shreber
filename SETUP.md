# SETUP — הקמת מערכת ללקוח חדש (Clone Checklist)

מדריך שלב-אחר-שלב להקמת עותק חדש ועצמאי של המערכת עבור לקוח נוסף.
כל הלקוחות חולקים את **אותו repo** ב-GitHub, אך לכל לקוח יש:
- פרויקט Supabase משלו (מסד נתונים נפרד לגמרי)
- פרויקט Vercel משלו (דומיין ומשתני סביבה נפרדים)
- חשבון Kesher / SMTP / Yemot משלו

> שמות משתנים (env var names) נשארים באנגלית בדיוק כפי שמופיעים כאן וב-`.env.example`.

---

## 1. יצירת פרויקט Supabase חדש

1. היכנסו ל-<https://supabase.com> → **New project**. בחרו שם, סיסמה חזקה למסד (שמרו אותה), ו-Region קרוב ללקוח.
2. לאחר שהפרויקט עולה: **Project Settings → Database → Connection string**.
3. הכינו שני חיבורים (שימו לב לפורטים):
   - `DATABASE_URL` — ה-**Transaction pooler** (פורט **6543**), עם הסיומת `?pgbouncer=true&connection_limit=1`.
     דוגמה:
     ```
     postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
     ```
   - `DIRECT_URL` — ה-**Direct connection** (פורט **5432**), ללא ה-pgbouncer. משמש ל-`prisma db push` / migrations.
     דוגמה:
     ```
     postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
     ```
4. הפורט 6543 (pgBouncer, transaction pooler) הוא זה שהאפליקציה משתמשת בו ב-runtime — לא ה-direct host.

---

## 2. יצירת פרויקט Vercel חדש

1. היכנסו ל-<https://vercel.com> → **Add New → Project**.
2. חברו את **אותו GitHub repo** (Shreber) שכל הלקוחות משתמשים בו. אין fork ואין repo חדש.
3. תנו לפרויקט שם ייחודי ללקוח, והגדירו לו **דומיין משלו** (Project → Settings → Domains).
4. הגדירו את כל משתני הסביבה (סעיף 3) תחת **Settings → Environment Variables** (Production, ואם צריך גם Preview).
5. לאחר הגדרת המשתנים — הריצו Deploy.

---

## 3. משתני סביבה (Environment Variables)

מבוסס על `.env.example`. הגדירו את כולם בפרויקט ה-Vercel של הלקוח:

### מסד נתונים (Supabase)
- `DATABASE_URL` — pooler, פורט 6543, עם `?pgbouncer=true&connection_limit=1` (סעיף 1).
- `DIRECT_URL` — direct, פורט 5432 (סעיף 1).

### אימות (NextAuth / Auth.js)
- `AUTH_SECRET` — **חדש לכל לקוח**. הפיקו עם: `openssl rand -base64 32`.
- `AUTH_URL` — כתובת ה-production של הלקוח, למשל `https://<domain>`.
- `NEXTAUTH_URL` — זהה ל-`AUTH_URL`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — אופציונלי (רק אם רוצים התחברות עם Google; התחברות עם סיסמה עובדת בלעדיהם). ה-redirect URI המורשה: `https://<domain>/api/auth/callback/google`.

### Kesher (סליקה)
- `KESHER_API_USERNAME`
- `KESHER_API_PASSWORD`
- `KESHER_API_TOKEN` — Bearer token ל-endpoints מסוג `KesherAPI/*` (אופציונלי).
- `KESHER_MOCK` — `"false"` בפרודקשן (`"true"` = ללא חיובים אמיתיים, לבדיקות).
- `KESHER_DEVELOPER_MAIL` — מייל המפתח הרשום בחברת ה-Kesher; **חובה** להחלפת כרטיס בהו"ק קיימת. חייב להתאים למשתמש מפתח בפאנל של Kesher, אחרת מתקבל Code 309.
- `KESHER_WEBHOOK_SECRET` — סוד משותף ש-Kesher חייב לשלוח בקריאת ה-webhook (סעיף 6).

### דוא"ל (SMTP — תזכורות ומיילים)
- `SMTP_HOST` — למשל `smtp.gmail.com`.
- `SMTP_PORT` — `465` (או `587`).
- `SMTP_SECURE` — `"true"` לפורט 465, `"false"` ל-587.
- `SMTP_USER` — החשבון שממנו נשלח הדואר.
- `SMTP_PASS` — סיסמה. ב-Gmail: **App Password** בן 16 תווים (לא הסיסמה הרגילה).
- `MAIL_FROM` — אופציונלי; ברירת מחדל = `SMTP_USER`.
- `NOTIFY_EMAIL` — לאן נשלחות התזכורות; ברירת מחדל = `SMTP_USER`.

### Cron (משימות)
- `TASKS_CRON_SECRET` — סוד ש-scheduler חיצוני חייב לצרף (סעיף 7).

### Yemot / הקלטות (רק אם הלקוח משתמש בהקלטות טלפון)
- `YEMOT_USERNAME` — מספר המערכת.
- `YEMOT_PASSWORD` — סיסמת הפאנל.
- `YEMOT_RECORDINGS_EXT` — למשל `6`.
- `YEMOT_RECORDINGS_PATH` — למשל `6/1`.

---

## 4. הקמת סכמת המסד + Seed

הריצו מקומית (או בסביבה זמנית) כשמשתני הסביבה מצביעים ל-Supabase החדש.
חשוב: `prisma db push` עובד מול `DIRECT_URL` (פורט 5432).

```bash
npm install            # מתקין תלויות + מריץ prisma generate (postinstall)
npm run db:push        # יוצר את כל הטבלאות במסד החדש (משתמש ב-DIRECT_URL)
npm run db:seed        # ממלא נתוני ברירת מחדל
```

ה-`db:seed` ממלא, באופן idempotent (בטוח להרצה חוזרת):
- טבלת סטטוסים של Kesher (`KesherStatus`).
- קטגוריות ברירת מחדל (`Category`).
- שורת הגדרות `KesherSettings`.
- משתמש admin ברירת מחדל (סעיף 5).
- **תבניות המייל** (`EmailTemplate`) — מתוך `prisma/seed-data/email-templates.json` (שמחות / דוח תשלומים / תזכורת יתרה).
- **ערכי הרשימות הנפתחות** (`ListOption`) — מתוך `prisma/seed-data/list-options.json` (city / country / donationType / leregel).

> **נתוני דמו (demo):** אינם נזרעים כברירת מחדל. אם רוצים איש-קשר/הו"ק/תנועה לדוגמה למסך ריק — הריצו עם `SEED_DEMO=true`:
> ```bash
> SEED_DEMO=true npm run db:seed
> ```

---

## 5. שינוי סיסמת ה-admin — מיד

ה-seed יוצר משתמש התחברות ראשוני:

- אימייל: `admin@example.com`
- סיסמה: `admin1234`

**מיד לאחר ההקמה**: התחברו והחליפו את הסיסמה (או צרו משתמש admin אמיתי ומחקו/השביתו את ברירת המחדל). אין להשאיר את `admin1234` בפרודקשן.

---

## 6. חיבור ה-webhook של Kesher

בפאנל של חשבון ה-Kesher של הלקוח, הפנו את ה-webhook אל:

```
https://<domain>/api/webhooks/kesher
```

והגדירו בו את אותו סוד כמו `KESHER_WEBHOOK_SECRET` שהגדרתם ב-Vercel.

---

## 7. הגדרת Cron חיצוני למשימות

הגדירו scheduler חיצוני (למשל cron-job.org) שיקרא כל דקה אל:

```
https://<domain>/api/cron/tasks?secret=<TASKS_CRON_SECRET>
```

כאשר `<TASKS_CRON_SECRET>` זהה למשתנה שהגדרתם ב-Vercel.

---

## 8. הערות חשובות

- **קוד משותף לכולם:** מאחר שכל הלקוחות עובדים על אותו repo, כל תיקון קוד / פיצ'ר שממוזג ל-`main` נפרס אוטומטית לכל פרויקטי ה-Vercel של כל הלקוחות. אין צורך לעדכן כל לקוח בנפרד — רק לוודא שהשינוי מתאים לכולם.
- **מה לא מועתק ללקוח החדש:** נתוני הלקוח הראשון אינם מיובאים. המערכת החדשה מתחילה ריקה מבחינת:
  - אנשי קשר (Contacts)
  - הוראות קבע / התחייבויות (Obligations)
  - תנועות (Transactions)
  - כרטיסי אשראי / טוקנים (CreditCards)
  - מיילים שנשלחו (SentEmails)

  מה **כן** מגיע מוכן: תבניות המייל, ערכי הרשימות הנפתחות, הקטגוריות, סטטוסי Kesher, והמשתמש admin — הכול דרך ה-seed.
