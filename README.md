# Hong Badminton Academy — Management System

Web-based academy management built on **Next.js (App Router) + Supabase + Stripe**,
deployable to **Vercel**. Covers the full brief: NFC attendance, coach marking,
monthly score cards with WhatsApp delivery, online fee payments, and a
role-based admin backend.

> **Status:** Foundation complete and building (`next build` passes). All 6
> modules have schema + APIs; admin CRUD + auth/RBAC + coach marking + parent
> payments are functional. See **Module status** below for what is wired vs.
> stubbed.

---

## Modules (per brief)

| # | Module | What's here |
|---|--------|-------------|
| 1 | **Attendance (NFC)** | Tap ingest API (`/api/nfc/tap`), tag→student→session resolution, tap-in/out, auto late/absent flagging (cron RPC), live roster + history. |
| 2 | **Coach marking** | Per-coach portal, configurable marking schemes + weighted scoring, session notes, progress history, multi-coach classes. |
| 3 | **Score cards + WhatsApp** | Monthly card generation (marks + attendance + rewards), WhatsApp send via Meta Cloud API (behind interface), message log + delivery-status webhook. |
| 4 | **Payments** | Stripe Checkout behind a gateway-agnostic interface, webhook reconciliation, parent self-pay, manual reconcile, transaction log. |
| 5 | **Admin backend** | Email/password auth, RBAC (admin/coach/parent) via Postgres RLS, CRUD for students/parents/coaches/classes/schedules/enrolment/marking schemes/fee plans/reward rules, CSV export. |
| 6 | **Web setup** | Supabase Postgres + Auth + Storage, daily cron, responsive UI, deploy config for Vercel. |

---

## Tech stack

- **Next.js 15** (App Router, Server Actions, TypeScript)
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- **Stripe** — payment gateway (swap to iPay88/eGHL via `src/lib/payments`)
- **Meta WhatsApp Cloud API** — messaging (`src/lib/whatsapp`)
- **Tailwind CSS v4**
- **Vercel** — hosting + Cron

---

## Quick start (local)

### 1. Install dependencies
```bash
npm install
```
> This machine has a portable Node at `./.tools/node-v24.16.0-win-x64`. Add it to
> PATH for the session, or install Node 20+ globally.

### 2. Create a Supabase project & apply the schema
Option A — **hosted project** (recommended):
```bash
npx supabase link --project-ref <your-ref>
npx supabase db push          # applies supabase/migrations/*
```
Option B — **local stack** (needs Docker):
```bash
npx supabase start
npx supabase db reset         # applies migrations + seed.sql (demo data)
```

### 3. Configure environment
Copy `.env.local.example` → `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- (optional) Stripe, WhatsApp, NFC, and cron secrets

> Until Supabase keys are set, the app still boots — login shows a "not
> configured" notice instead of crashing.

### 4. Run
```bash
npm run dev      # http://localhost:3000
```

### Demo logins (after `db reset` with seed data)
All use password **`Password123!`**:
`admin@hba.test` · `coach1@hba.test` · `coach2@hba.test` · `parent1@hba.test` · `parent2@hba.test`

> On a hosted project (no seed), create the first admin with
> `node scripts/create-admin.mjs` (see below) or via the Supabase dashboard:
> add a user, then set their `profiles.role = 'admin'`.

---

## Deploy

### Supabase
1. Create project → copy URL + anon + service-role keys.
2. `npx supabase link` + `npx supabase db push`.
3. Storage buckets (`avatars`, `student-photos`, `scorecards`) are created by migration `0004`.

### Vercel
1. Import the repo, set the env vars from `.env.local`.
2. `vercel.json` already registers the daily cron `POST /api/cron/flag-absences` (16:00 UTC ≈ midnight MYT). Set `CRON_SECRET` so the endpoint is protected.
3. Deploy. Set `NEXT_PUBLIC_APP_URL` to the production URL.

### Stripe
- Set `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- Add a webhook → `https://<app>/api/webhooks/stripe`, event `checkout.session.completed`; put the signing secret in `STRIPE_WEBHOOK_SECRET`.

### WhatsApp (Meta Cloud API)
- Set `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`.
- Configure the webhook → `https://<app>/api/webhooks/whatsapp` (GET verify + POST status callbacks).
- Without a token, sends are logged as `failed` (dev stub) but the pipeline still works.

### NFC reader / bridge
- POST taps to `https://<app>/api/nfc/tap` with header `x-api-key: <NFC_API_KEY>`:
  ```json
  { "tag_uid": "04A1B2C3", "reader_id": "court-1", "class_id": "<optional>" }
  ```
- Physical tags/readers are out of scope (per brief); admins can also simulate taps from the attendance roster.

---

## Project layout

```
src/
  app/
    (admin)/admin/…     Admin portal (dashboard, CRUD, attendance, scorecards, invoices, reports)
    (coach)/coach/…     Coach portal (dashboard, marking, attendance)
    (parent)/parent/…   Parent portal (dashboard, scorecards, invoices + pay)
    api/
      nfc/tap           NFC ingest (x-api-key)
      webhooks/stripe   Payment reconciliation
      webhooks/whatsapp Delivery-status callbacks
      cron/flag-absences  Daily attendance finalisation
      export            CSV exports (admin)
    login               Auth
  lib/
    supabase/           client / server / admin / middleware
    payments/           gateway interface + Stripe impl
    whatsapp/           provider interface + Meta Cloud impl
    auth.ts             RBAC guards
supabase/
  migrations/           0001 schema · 0002 functions/triggers · 0003 RLS · 0004 storage
  seed.sql              demo data (local)
```

---

## Module status / what's next

**Done & wired:** auth + RLS, all tables, admin CRUD, NFC tap + flagging, coach
marking + notes, Stripe checkout + webhook, WhatsApp send + log + status webhook,
score card aggregation, CSV export, daily cron.

**Score card PDF:** generated with `pdf-lib` ([src/lib/scorecard-pdf.ts](src/lib/scorecard-pdf.ts)),
stored in the private `scorecards` bucket, served via the RLS-checked route
`/api/scorecards/[id]/pdf` (302 → short-lived signed URL). WhatsApp sends include
a 7-day signed link. Branding (logo/colours/wording) is the only client-provided
piece outstanding.

**Stubbed / client-dependent (per brief "Client-Provided Inputs"):**
- **Marking criteria & weights**, **reward calculation logic**, **branding**,
  and **card wording** are configurable and await client content.
- **WhatsApp message templates** must be approved in Meta before business-initiated sends.
- Swap Stripe → **iPay88 / eGHL** by adding an impl in `src/lib/payments`.

---

## Client-provided inputs still required
Marking scheme criteria + weighting · reward rules/logic · initial
student/parent/coach data · branding assets · score-card layout/wording.
(Hardware, WhatsApp/Stripe account fees, domain/SSL costs are out of scope per the brief.)
