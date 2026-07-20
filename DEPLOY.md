# Deploy guide — Supabase + GitHub + Vercel

The app now uses **PostgreSQL** (Supabase). Follow these once.

---

## 1. Supabase — create the database
1. Go to **supabase.com** → **New project**. Pick a name + a strong DB password (save it).
2. When ready: **Project Settings → Database → Connection string**.
3. Copy two strings:
   - **Transaction pooler** (port **6543**) → this is your **`DATABASE_URL`**. Add `?pgbouncer=true&connection_limit=1` at the end.
   - **Direct connection** (port **5432**) → this is your **`DIRECT_URL`**.
   - Replace `[YOUR-PASSWORD]` in both with your DB password.

## 2. Push the schema + seed (run once, from your PC)
In the project folder, put the two Supabase URLs in your local `.env` (`DATABASE_URL`, `DIRECT_URL`), then:
```bash
npx prisma db push      # creates all tables in Supabase
npm run db:seed         # KesherStatus + categories + admin user (admin@example.com / admin1234)
```
(You can re-import your Kesher hoks/transactions later with the **ייבוא מקשר** button.)

## 3. GitHub — push the code
```bash
git init
git add -A
git commit -m "Initial commit"
```
Create an empty repo on GitHub, then:
```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```
`.env` is git-ignored — your secrets are NOT pushed. Good.

## 4. Vercel — deploy
1. **vercel.com** → **Add New → Project** → import your GitHub repo. Framework auto-detects **Next.js**.
2. Before deploying, add **Environment Variables** (Settings → Environment Variables) — copy every key from `.env.example`:
   - `DATABASE_URL`, `DIRECT_URL` (from Supabase)
   - `AUTH_SECRET` (generate: `openssl rand -base64 32`)
   - `AUTH_URL` and `NEXTAUTH_URL` = your Vercel URL, e.g. `https://your-app.vercel.app`
   - `KESHER_API_USERNAME`, `KESHER_API_PASSWORD`, `KESHER_API_TOKEN`
   - `KESHER_MOCK=false`
   - `KESHER_WEBHOOK_SECRET` (a long random string)
   - (optional) `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
3. **Deploy.** You'll get a live URL.
4. After the first deploy, set `AUTH_URL` / `NEXTAUTH_URL` to the **real** URL Vercel gave you, and redeploy.

## 5. Kesher — turn on the webhook (this is what makes Case A live)
In Kesher's panel, register the webhook URL:
```
https://your-app.vercel.app/api/webhooks/kesher?secret=<KESHER_WEBHOOK_SECRET>
```
Now Kesher's monthly charges will POST here and land on the right obligation automatically.

---

## Notes
- Local dev now also needs Postgres — point local `.env` at the same Supabase project (or a Supabase branch).
- The `--use-system-ca` flag in `npm run dev` is only for local network quirks; Vercel doesn't need it.
- Google OAuth: add `https://your-app.vercel.app/api/auth/callback/google` as an authorized redirect URI.
