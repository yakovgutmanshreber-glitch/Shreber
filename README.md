# מערכת ניהול כספים — Financial Management System

Hebrew RTL financial management system for tracking obligations (recurring
commitments), transactions, contacts, and categories — integrated with the
**Kesher** payment API (kesherhk.info).

Built with **Next.js 15 (App Router) · TypeScript · Prisma (SQLite) · NextAuth ·
Tailwind CSS**.

---

## Quick start

```bash
npm install --legacy-peer-deps      # legacy flag avoids a Prisma peer-dep quirk
cp .env.example .env                # a working .env is already included for dev
npm run db:push                     # create the SQLite schema
npm run db:seed                     # seed KesherStatus + categories + demo data
npm run dev                         # http://localhost:3000
```

Default login (created by the seed): **admin@example.com / admin1234** — change it.

### Useful scripts

| script | purpose |
|---|---|
| `npm run dev` | start the dev server |
| `npm run build` | production build (runs `prisma generate` first) |
| `npm run db:push` | apply the Prisma schema to the DB |
| `npm run db:seed` | seed lookup tables + demo data |
| `npm run db:reset` | wipe + recreate + reseed |
| `npm run db:studio` | open Prisma Studio |

---

## Architecture

```
src/
  app/
    (app)/               authenticated area (top-nav layout + auth guard)
      contacts/          אנשי קשר — list + [id] profile
      income/            הכנסות  (standalone, contactId = null, kind=income)
      expenses/          הוצאות (standalone, contactId = null, kind=expense)
      categories/        קטגוריות — CRUD grouped by main category
      reports/           דוחות — placeholder ("בקרוב")
      settings/          הגדרות — admin only (Kesher config status + webhook URL)
    api/
      auth/[...nextauth] NextAuth handlers
      contacts|categories|obligations|transactions   REST CRUD
      settings           project_number + Kesher status
      webhooks/kesher    ← PRIMARY Kesher sync endpoint
    login/               Google + username/password login
  components/            TopNav, forms, shared UI
  lib/
    auth.ts              NextAuth config (Google + Credentials, role in session)
    prisma.ts            Prisma client singleton
    kesher/              isolated Kesher API client (client.ts, types.ts)
    schemas.ts           Zod validation
    constants.ts         enum ↔ Hebrew label maps + Kesher status codes
prisma/
  schema.prisma          full data model
  seed.ts                KesherStatus + categories + admin + demo
```

## Authentication & roles

- **Google OAuth** and **username/password** are both supported. Google is
  auto-hidden on the login page until `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
  are set.
- On first Google login a `User` is created with `role = 'user'`. Promote to
  admin in the DB (or Prisma Studio) — set `role = 'admin'`.
- `role` is exposed on the session (`session.user.role`). The mechanism is in
  place; fine-grained permissions are intentionally **not** enforced yet beyond
  the admin-only Settings screen, per spec.
- All `(app)` routes are guarded server-side (redirect to `/login`).

## Kesher integration

The Kesher client lives entirely in `src/lib/kesher/`. Request shaping is based
on Kesher's official API docs and **verified live against project 1596**. It
centralizes:

- credential loading (env secrets + `project_number` from the DB),
- the real request envelope (see below),
- **mock mode** (`KESHER_MOCK=true`, or auto-on when credentials are missing) so
  the whole app runs end-to-end with no live charges.

**Real request contract** (this differs from the initial spec — corrected after
testing against the live API):

- **Legacy endpoint** `POST /ConnectToKesher/ConnectToKesher`:
  ```json
  { "Json": { "func": "<Action>", "format": "json",
              "userName": "…", "password": "…", "…params": {} },
    "format": "json" }
  ```
  Response `{ Code, Status, Data, Description }` — `Status === true` means success.
  Params are either direct siblings (`transactionNum`, `fromDate`) or a named
  sub-object per function (`tran`, `transaction`, `cashTran`, `obligDetails`,
  `tranDetails`).
- **Amounts are in whole shekels** (`Total`/`Sum`), **not agorot**.
- **REST endpoints** `POST/GET /KesherAPI/*` use **Bearer-token** auth
  (`KESHER_API_TOKEN`) and flat JSON bodies: `ChangeChargeOptionForObligation`,
  `ChargeNextCollection`, `HasBankAuth`, `GetBankAuthList`. This token is issued
  separately in Kesher's admin panel — **not yet configured** (the legacy
  username/password endpoints work without it).

Supported calls: `SendTransaction`, `CreditTransaction`, `SendBankObligation`,
`UpdateObligation`, `ChangeChargeOptionForObligation`, `ChargeNextCollection`,
`HasBankAuth`, `GetBankAuthList`, `GetTrans`, `GetAllTransForCompany`,
`GetTranData`, `GetObligations`, `CancelTranByNumTransaction`,
`CheckGetCreditCard`.

### Webhook (primary sync)

`POST /api/webhooks/kesher` is the primary sync path (no polling scheduler).
Kesher pushes Transaction / Obligation / Customer events; the receiver:

1. logs every raw payload to `WebhookLog` (audit/debug) **before** processing,
2. upserts Transactions (match `kesher_num_transaction` → fallback `uniq_num`),
   auto-linking to the Obligation via `ObligationReference` and inheriting `kind`,
3. upserts Obligations (match `ObligationReference`),
4. upserts Contacts (match `kesher_client_ref` / `ClientRef`).

**⚠️ Webhook auth needs confirmation with Kesher support.** Kesher's docs don't
fully specify webhook signing, so we currently accept a shared secret via
`?secret=` query param or `X-Kesher-Secret` header (`KESHER_WEBHOOK_SECRET`).
Confirm the real mechanism (signature header / IP allowlist) and tighten this.

## Environment variables

See `.env.example`. Key ones:

- `DATABASE_URL` — SQLite by default; swap the Prisma `provider` to `postgresql` for prod.
- `AUTH_SECRET`, `AUTH_URL` — NextAuth.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — optional Google OAuth.
- `KESHER_API_USERNAME` / `KESHER_API_PASSWORD` / `KESHER_API_TOKEN` — Kesher secrets.
- `KESHER_MOCK` — `"true"` to force mock mode.
- `KESHER_WEBHOOK_SECRET` — shared secret for the webhook.

## Manual vs. API transactions

Manual transactions (cash / check / bank transfer entered by a user) are
inserted directly with `source: 'manual'` and **skip the Kesher API entirely**
(spec §5). API/webhook transactions carry `source: 'api'` and Kesher identifiers.

## Notes & next steps

- Reports (`דוחות`) is a placeholder by design.
- Production: move to Postgres, set real `AUTH_SECRET`, configure Google OAuth,
  set Kesher secrets + `KESHER_MOCK=false`, and lock down the webhook auth.
