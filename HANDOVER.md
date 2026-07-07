# Hong Badminton Academy — System Handover

> Complete operator + developer handover for the Hong Badminton Academy (HBA)
> Management System. Written for someone taking over cold. Pair this with
> [`README.md`](README.md) (dev quick-start), [`OPERATIONS.md`](OPERATIONS.md)
> (day-to-day operator guide), and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
> (system diagram + database ER diagram).
>
> **Last updated:** 2026-07-07.

---

## 1. What this is

A web app that runs a badminton academy end-to-end: NFC attendance, coach
marking, promotion exams, monthly reports, fee billing with online payment, a
role-based admin backend, and automated parent messaging over WhatsApp + web
push. It also hosts a second, separate business — a **Club** (adult membership +
court booking) — inside the same app.

Three user portals, one codebase:

- **Admin** (`/admin`) — runs the academy. Two tiers: **super-admin** (owner,
  full control) and **branch admin** (daily ops only).
- **Coach** (`/coach`) — check-in, marking, assessments, exams, own payroll.
- **Parent** (`/parent`) — child progress, schedule, leave requests, fee payment.

Plus a public **Club** surface (`/club`) with no login, and a passwordless club
**member portal** (`/club/me/[token]`).

---

## 2. Tech stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 15** (App Router, Server Actions, React 19, TypeScript) |
| Backend/DB | **Supabase** — Postgres + Auth + Storage + Row Level Security |
| Payments | **Stripe** (hosted Checkout), behind a gateway-agnostic interface in `src/lib/payments` |
| Messaging | **WhatsApp** via an external `whatsapp-web.js` worker (unofficial) + **Web Push** (VAPID) |
| Styling | **Tailwind CSS v4** |
| Charts | **recharts** |
| PDFs | **pdf-lib** (exam reports, invoices, score cards) |
| Hosting | **Vercel** (app + cron) + one always-on **Windows box** (the WhatsApp worker) |

Node is **portable** on the dev machine (see §5). There is no global Node/npm.

---

## 3. Accounts, refs & where things live

> These are external-service identifiers captured from project history. **Verify
> each is still valid before relying on it** — access may have changed.

| Thing | Value |
|-------|-------|
| GitHub repo | **`github.com/Hide-and-Seeds/HongBadmintonAcademy`** (branch `main`). Moved from `leorickingdom-source/…` on 2026-07-07; old URL still redirects. |
| Vercel project | `hong-badminton-academy` — prod URL **`https://hong-badminton-academy.vercel.app`**. Deploys on push to `main` via Vercel's GitHub integration. |
| Supabase project ref | **`njxrxpdxttwuawsqvkku`** (`https://njxrxpdxttwuawsqvkku.supabase.co`). Uses the new `sb_publishable_` / `sb_secret_` API key format. |
| Stripe | Sandbox account "Hide and Seeds" (`acct_1TesJv…`), **TEST mode**. Currency MYR. Webhook → `/api/webhooks/stripe`, event `checkout.session.completed`. See [`STRIPE.md`](STRIPE.md). |
| WhatsApp worker host | The **academy's own Windows box** (client site). Public URL is an **ephemeral Cloudflare tunnel** that self-registers (see §12). |
| Owner contact | `leoric.kingdom@gmail.com` |

**Deploy caveat that already caused one outage:** after the GitHub repo moved to
the `Hide-and-Seeds` org, Vercel's Git integration kept watching the old path, so
pushes built nothing. If "pushed but not live" → Vercel → Settings → Git must
point at `Hide-and-Seeds/HongBadmintonAcademy`.

---

## 4. Environment variables

Set in **Vercel → Project → Settings → Environment Variables** (not in git;
`.env*.local` is gitignored). Template lives in
[`.env.local.example`](.env.local.example).

### App (Vercel)

| Var | Purpose | Required? |
|-----|---------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser (publishable) key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — bypasses RLS. Used by crons, webhooks, worker routes, and all parent/club pages. Never expose. | Yes |
| `NEXT_PUBLIC_APP_URL` | Prod URL (Stripe redirects, links). Base URL is also request-derived, so this is a fallback. | Recommended |
| `PARENT_AUTH_SECRET` | 32+ chars. HMAC key for the parent session cookie. **Rotating it logs out every parent.** Falls back to service-role key locally. | Yes (prod) |
| `STRIPE_SECRET_KEY` | `sk_…` | For payments |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | For payments |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_…` (not strictly needed for redirect checkout) | Optional |
| `PAYMENT_CURRENCY` | `MYR` | Optional |
| `CRON_SECRET` | Authenticates Vercel Cron calls. Every `/api/cron/*` route checks it. | Yes |
| `WA_WORKER_URL` | Fallback worker URL + gates provider selection. The live URL is normally the self-registered one in the DB (§12). | Yes |
| `WA_WORKER_SECRET` | Shared bearer secret, app ↔ worker. **Must match the worker's `.env`.** Was pasted in chat once → should be rotated. | Yes |
| `WA_COMMUNITY_GROUP_ID` | WhatsApp Community/Announcements group chat id (`…@g.us`). **Required** for any Community post. | For Community posts |
| `WA_COMMUNITY_LINK` | Optional group invite link (parent join card, poster QR). | Optional |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | Web Push keys. Regenerate with `node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"`. | For push |
| `NFC_API_KEY` | Shared secret the NFC reader/bridge sends as `x-api-key`. | For NFC ingest |
| `WHATSAPP_*` (Meta Cloud API) | Legacy Meta provider (token, phone id, verify token). **Not in use** — kept behind the interface for a future verified-business path. Empty = the wwebjs worker is used instead. | No |

### Worker (`wa-worker/.env` on the Windows box)

| Var | Purpose |
|-----|---------|
| `WA_WORKER_SECRET` | Same value as the app's. |
| `APP_URL` | The prod app URL. **Setting this enables drip-sending + URL self-registration.** Unset = worker only answers direct `/send`, doesn't poll the queue. |
| `PORT` | `8787`. |
| `CHROME_PATH` | Path to a real Google Chrome (e.g. `C:\Program Files\Google\Chrome\Application\chrome.exe`). See the Chrome gotcha in §12. |

---

## 5. Local development

The dev machine has **no global Node** — a portable Node lives at
`D:\HBA\.tools\node-v24.16.0-win-x64` (gitignored). Shell state does not persist
between commands, so prepend it every time in PowerShell:

```powershell
$env:Path = "D:\HBA\.tools\node-v24.16.0-win-x64;" + $env:Path
npx next dev        # http://localhost:3000
```

The Bash tool has no Node — use PowerShell for anything Node-related.

Common scripts: `npm run dev`, `npm run build`, `npm run typecheck`
(`tsc --noEmit`), `npm run lint`.

**Database:** migrations are in `supabase/migrations/*` (currently **50 files**,
`0001`→`0048`). Apply to a hosted project with `npx supabase link --project-ref
<ref>` then `npx supabase db push`, or run a local stack with `npx supabase start`
+ `npx supabase db reset` (which also loads `supabase/seed.sql` demo data).

**First admin on a fresh DB:** `node scripts/create-admin.mjs`, or add a user in
the Supabase dashboard and set `profiles.role = 'super_admin'`. Other helper
scripts live in `scripts/` (Stripe smoke tests, ledger checks, phone checks, PDF
verify, etc.).

**Demo logins** (local seed only, password `Password123!`): `admin@hba.test`,
`coach1@hba.test`, `parent1@hba.test`, …

---

## 6. Deployment pipeline

1. Commit + push to `main` on `Hide-and-Seeds/HongBadmintonAcademy`.
2. Vercel's GitHub integration auto-builds and deploys.
3. Env vars are managed in Vercel (§4), **not** in git.
4. Always use the canonical alias `hong-badminton-academy.vercel.app` — the
   per-deployment `-<hash>-` URLs are frozen to old builds.

No `vercel` CLI / MCP one-off deploys — the owner wants git-based CI/CD.

`vercel.json` pins the region to `sin1` (Singapore) and registers the cron jobs
(§11).

---

## 7. Roles, auth & security

### Three trust boundaries

1. **Staff (admin, super_admin, coach)** — real **Supabase Auth** sessions.
   Postgres RLS enforces access via `is_admin()` / `is_super_admin()` /
   `coach_of_*` helper functions.
2. **Parents** — **no Supabase session**. They log in with email + password
   (verified against Supabase), then the app drops the Supabase session and
   issues its own signed **`hba_parent` cookie** (HMAC-SHA256, 1-year,
   `PARENT_AUTH_SECRET`). To Postgres they are anonymous, so **every parent page
   and action uses the service-role client and MUST filter by the cookie-resolved
   profile id / the parent's own children.** That filter *is* the access boundary.
3. **Club members** — same passwordless pattern, a separate HMAC token in the URL
   (`/club/me/[token]`, `src/lib/club-auth.ts`).

`service_role` is also what crons, webhooks, the worker, and NFC ingest run as.

Login is unified at **`/login`** for staff and parents; the router inspects the
profile role and either keeps the Supabase session (staff) or swaps to the parent
cookie (parent). `/parent-login` is a redirect kept for old bookmarks. Password
reset is by email (`/parent-login/forgot` → `/parent-login/reset`) and works for
any account.

### Security invariants — keep these or vulnerabilities regress

- **Server Actions are standalone POST endpoints; the `(admin)` layout guard does
  NOT protect them.** Every admin action that uses the service-role client
  (`createAdminClient()`) must call `await requireRole("admin")` (or
  `requireSuperAdmin()`) as its first line. (A 2026-06-22 audit found unguarded
  user-management actions — any coach could have minted an admin.)
- **Never write a bare `role === "admin"` check** — super-admins would fail it.
  Use `isAdminRole(role)` (in `src/lib/auth.ts`) or include `"super_admin"`.
  `requireRole("admin")` auto-allows super_admin; hand-rolled checks don't.
- **Finance visibility (owner rule, 2026-07-06):** revenue, paid history,
  analytics, and invoice/payment exports are **super-admin only**. Branch admins
  get an "Outstanding Fees" worklist (chase / remind / mark-paid / cancel unpaid)
  but no revenue. Refunds are super-admin only. Gate any new finance surface the
  same way.
- **Staff 2FA** (TOTP, Supabase native MFA) is opt-in, staff-only, enrolled on the
  Account page. A super-admin can force it academy-wide (Settings → Security).
  Recovery = 8 one-time backup codes, or a super-admin "Reset 2FA" on the staff
  edit page. **Keep ≥2 super-admins** — a sole-super lockout with 2FA lost has no
  in-app recovery beyond backup codes.

### Known security TODOs (open)

- `student-photos` storage bucket is **public** (PII of minors) — make it private
  + signed URLs.
- Enable Supabase leaked-password protection (dashboard).
- Some secondary tables (exams, scorecards, reward ledger, marking schemes,
  messages, nfc events) are still `is_admin`-wide, not branch-scoped — acceptable
  today (branch admins reach them only through branch-scoped parents in the UI),
  revisit if the academy adds many branches.

Full detail: memory notes `hba-authz-model`, `hba-finance-visibility`.

---

## 8. Data model

Postgres, ~40 tables across the migrations. Grouped by domain:

**Identity & org**
`profiles` (one per auth user; role, phone, locale, push mute, MFA/PIN columns),
`branches` (multi-branch; most core tables carry a `branch_id`), `students`
(level 1-6, nickname, assigned `coach_id`, branch), `mfa_backup_codes`,
`push_subscriptions`, `parent_login_tokens`, `notifications`.

**Classes & scheduling**
`classes`, `class_coaches` (multi-coach), `class_schedules`, `enrollments`,
`sessions`, `school_holidays`, `public_holidays` (CSV/XLSX import).

**Attendance**
`attendance` (per student per session; present/late/absent/excused),
`nfc_tap_events`, `coach_checkins` ("I'm here" per coach per session),
`leave_requests` (+ `makeup_session_id`), `coach_leave_requests`.

**Marking, exams & progress**
`marking_schemes` + `marking_criteria` (legacy weighted scheme), `assessments` +
`assessment_scores` (**dead** — legacy scorecard pipeline), `session_marks`
(per-session rating), `weekly_marks`, `monthly_assessments` (current monthly
report: fitness/skills/attitude 1-5 + comment), `session_notes`, `level_exams`
(promotion exams, 100-pt rubric), `skill_mastery`, `rank_events` (level-change
audit log), `scorecards` (**legacy** monthly PDF, retired).

**Billing & rewards**
`fee_plans` (+ Stripe product/price ids, `rank`/level, `business` tag),
`invoices` (`invoice_no` auto-generated by trigger; `business`, `branch_id`,
`club_member_id`), `payments`, `coach_pay` (per-lesson rate → payroll),
`reward_rules` + `reward_ledger` (**engine PARKED** — manual + leaderboard only).

**Messaging & settings**
`messages` (send log), `message_queue` (worker drip queue), `app_settings`
(key-value: kill switches, schedules, worker URL, 2FA-required flag).

**Club business** (separate from the academy)
`club_members`, `courts` (+ `hourly_rate`), `court_rentals` (what the academy
*pays* to rent courts; has a `business` tag), `court_bookings` (what club members
*book*).

**Generated TypeScript types:** `npm run db:types` →
`src/lib/types/database.ts`. App-facing types are hand-maintained in
`src/lib/types.ts`.

**DB triggers (`0002`):** new auth user → `profiles` row; invoice insert →
`invoice_no`; any row update → `updated_at`.

---

## 9. Feature modules by portal

### Admin (`/admin`) — nav in `src/lib/constants.ts` (`ADMIN_NAV`)

- **Daily:** Attendance (live board, matrix, per-session roster, coverage),
  Sessions (calendar, generate next 4 weeks skipping holidays), Leave & Makeup
  (approve/decline, assign makeup), Directory (students + parents + coaches,
  paginated, filters), Classes & Schedule.
- **Teaching:** Coaches & Payroll, At-risk (attendance-drop win-back), Leaderboard
  (by level), Exams & Progress, Training Syllabus (editable), Reward Rules.
- **Finance & Comms** (several **super-only**): Invoices & Payments, Collections
  (ageing + chase), **Club** (super-only hub), Fee Calculator, Announcements
  (post to Community), WhatsApp Log, **Fee Plans** (super), **Court Rentals**
  (super).
- **Insights & Setup:** **Analytics** (super), Reports & Export (CSV/PDF),
  Holidays, **Settings** (super).
- **Organization** (super): **Branches**, **Staff & Admins**.

Super-only items carry `superOnly: true` in the nav and are filtered out for
branch admins, who additionally get a **branch switcher** (super) / auto-scoped
view (branch admin).

### Coach (`/coach`) — `COACH_NAV`

Check-in & mark (live board, NFC scan, coach "I'm here", drop-in makeups),
Schedule (with a Leave button per session), Monthly Marks (whole-roster grid,
tap-to-save), Assessments/Exams (per-student promotion scoring), My Payroll.

### Parent (`/parent`) — `PARENT_NAV`

My Children (dashboard leads with the child's **monthly score**, level ladder,
exams), Schedule (with per-child Leave request + preferred-makeup proposal),
Monthly Report, Progress Card (exam PDF), Fees & Payments (Stripe pay).
Account has language (en/zh), notifications opt-in, password.

---

## 10. Attendance & NFC

- NFC taps POST to **`/api/nfc/tap`** with header `x-api-key: <NFC_API_KEY>`,
  body `{ tag_uid, reader_id, class_id? }`. The route resolves tag → student →
  active session and writes tap-in/out. Physical readers are out of scope per the
  brief; admins/coaches can also simulate taps from the roster.
- Coaches tap students in on the **check-in board**; they can add an existing
  student as a **drop-in** (e.g. an approved makeup) and scan them immediately.
- The `flag-absences` cron closes finished sessions and marks late/absent, and
  flips unpaid past-due invoices to `overdue`.
- Coach coverage (did the coach check in? was the roster marked?) is at
  `/admin/attendance/coverage` and on each session's detail.

---

## 11. Automations (Vercel Cron)

All in `vercel.json`, region `sin1`, times in **UTC** (MYT = +8), each gated by
`CRON_SECRET`. Routes under `src/app/api/cron/*`.

| Job | UTC | MYT | Does |
|-----|-----|-----|------|
| `flag-absences` | `0 16 * * *` | 00:00 daily | Close finished sessions, flag late/absent, flip unpaid past-due → overdue. |
| `enqueue-reminders` | `0 1 * * *` | 09:00 daily | **Web-push only** fee reminders to parents at exact milestones (due-today, overdue 3/7/14/28), milestone-gated so it can't spam. **WhatsApp fee reminders were removed 2026-06-22** (DMing parents about money is the top ban risk). |
| `generate-invoices` | `0 3 * * *` | 11:00 daily | On the admin-set **run day**, raise this month's fee invoice per active student on a monthly plan (due on the **due day**); prorates mid-month joiners; then posts the combined Community notice; also generates **club dues**. Idempotent. |
| `backup` | `0 18 * * *` | 02:00 daily | JSON snapshot of every table → private `backups` bucket, then prune `messages` + finished `message_queue` rows older than 90 days. |
| `exam-window` | `0 1 1 1,4,7,10 *` | 09:00 MYT, 1st of Jan/Apr/Jul/Oct | Open the promotion-exam window; nudge each coach (push + in-app) with their due-student count + an admin broadcast. |

> **Note:** the old `generate-scorecards` cron was **removed** (the monthly Growth
> Report PDF was retired; the exam result + monthly assessment are the progress
> surfaces now). The Community notice auto-degrades to fees-only.

**Manual equivalents** (same idempotent code): "Generate this month" on Invoices;
"Generate dues" on Club; "Post to Community" on Announcements.

---

## 12. The WhatsApp worker — the biggest operational risk

WhatsApp messages are **not** sent by Vercel (serverless can't hold a browser
session). They are sent by an always-on **`whatsapp-web.js`** worker
(`wa-worker/server.mjs`, Express + LocalAuth + puppeteer/Chrome) running on a
separate machine. **This is unofficial automation — ban risk is real** and
mitigated by policy + using a **dedicated bot number**, never a personal one.

### Architecture

```
Vercel cron ──queues──▶ message_queue ◀──polls── Worker (Windows box) ──sends──▶ WhatsApp
     app  ──direct /send (instant notices)──▶ Worker
     Worker ──self-registers its public URL──▶ app_settings.wa_worker_url
```

- The app talks to the worker at the URL from `app_settings.wa_worker_url`
  (`getResolvedWaWorkerUrl()`), falling back to the `WA_WORKER_URL` env var.
- **Host:** the **academy's own Windows box** (moved there 2026-07-07; the dev box
  and an earlier GCP VM were retired). Bundled Chromium via `CHROME_PATH`.
- **Public URL:** a **Cloudflare quick tunnel** (`cloudflared.exe`), reliable but
  its `*.trycloudflare.com` URL **changes on every restart**. Solved by
  self-registration: `wa-worker/tunnel.mjs` starts the tunnel, reads the URL, and
  POSTs it to `/api/worker/register-url` (bearer `WA_WORKER_SECRET`) on boot and
  every 5 min → stored in `app_settings`. Vercel never needs touching again.
  (Tailscale Funnel and ngrok were both tried and abandoned.)
- **Autostart:** a Startup-folder script launches the tunnel + a worker supervisor
  loop on boot. Needs Windows **auto-login** and **Sleep = Never** or a reboot
  sits at the lock screen and nothing sends.
- **One-run installer:** `wa-worker/setup-client.bat` (downloads Node if absent,
  cloudflared, deps, Chrome, Startup shortcut, shows the QR). See
  `wa-worker/START-HERE.md` / `CLIENT-SETUP.md`.

### Anti-ban send policy (`src/lib/reminders.ts`)

Admin-set in **Settings → Send schedule** (defaults): **09:00–20:00 MYT, ≤10
messages/day, ≥10-min gap**, ~30% of polls randomly skipped, queue shuffled,
auto-cancels a reminder if the invoice gets paid. The worker sends **one message
at a time**.

### Instant sends (bypass the drip)

Announcements "Post to Community", the manual monthly Community notice,
session-cancel notices, and rank-up congrats go out immediately via the worker's
`/send`, with a `message_queue` fallback if the worker is offline. Rank-up +
fee reminders to parents are **push-only** now (WhatsApp off; reversible via the
`RANK_UP_WHATSAPP` const).

### Kill switches (Settings → `app_settings`)

- **`worker_paused`** — stops *all* WhatsApp sending; everything stays queued.
- **`fee_reminders_paused`** — dormant (WhatsApp fee reminders no longer exist).

### Runbook (SSH/console on the worker box)

```bash
# health
curl -s http://localhost:8787/health         # {"ready":true} when logged in

# re-link after a logout (Disconnected: LOGOUT in logs)
#   stop worker, delete wa-worker/.wwebjs_auth, restart, scan the QR (or wa-worker/qr.png)
# Super-admin can also trigger re-link from Settings → "Disconnect & re-link".

# list groups (to find WA_COMMUNITY_GROUP_ID)
curl -s -H "Authorization: Bearer $WA_WORKER_SECRET" http://localhost:8787/groups
```

Cold-swap ban recovery: `wa-worker/relink.sh`. Link with the **dedicated bot
number** that is an **admin of the Community group**.

> **Chrome gotcha (cost hours):** modern puppeteer does not auto-download Chrome
> on `npm install`. Fix by pointing `CHROME_PATH` at an installed Google Chrome. A
> half-downloaded puppeteer cache folder (present but no `chrome.exe`) blocks every
> reinstall — delete `%USERPROFILE%\.cache\puppeteer\chrome\...` first.
> `npx puppeteer browsers install chrome` is **wrong** (pulls a mismatched build).

> **Stale doc:** `wa-worker/OPERATING.md` still describes the old GCP + Tailscale
> setup — ignore it; the live setup is Windows + Cloudflare above.

**If the worker is down or logged out, nothing sends — messages just queue.**
This is the single most likely thing to "break" from the owner's view.

---

## 13. Notifications — three channels

| Channel | Best for | Reach |
|---------|----------|-------|
| **Web Push** (VAPID, `src/lib/push.ts`) | in-the-moment (fees due, child absent, report ready, session cancel, rank-up) | Android/desktop full; iOS 16.4+ only if the PWA is installed first |
| **In-app bell** (`notifications` table, `src/lib/notifications.ts`) | everything, always visible | all roles, in the app shell; per-user mute |
| **WhatsApp** (worker) | keep-able + Community broadcasts | 100% of MY parents; needs the worker up |

`pushToUsers(profileIds, payload)` is service-role and works for parents (no
session). Notification writes are best-effort (try/catch) so a feed write never
breaks billing/cron/payments. Parents/coaches opt in on their Account page.

The app is a **PWA** (installable, offline shell). **Rule: the service worker
must never cache HTML navigations** — auth/role routing is dynamic; caching it
served stale login/role pages once (fixed). Only `/_next/static/*` is cached.

---

## 14. Billing, payments & finance

- **Fee plans** (`/admin/fee-plans`, super-only) map to Stripe products/prices;
  a "Sync to Stripe" button keeps them in step. Each plan has a level and a
  `business` tag (academy/club).
- **Invoices** auto-raise monthly (cron) or manually; `invoice_no` is
  trigger-generated; mid-month joiners prorate by remaining sessions.
- **Payment** = Stripe hosted Checkout (`src/lib/payments`, swappable to
  iPay88/eGHL by adding an impl). The **webhook** (`/api/webhooks/stripe`,
  signature-verified) marks the invoice paid, records the payment, and — for club
  invoices — activates the member / confirms the booking. Metadata carries the
  `business` tag.
- **Payroll:** `coach_pay.pay_per_lesson` × the coach's month-sessions (incl.
  co-coached) → coach payroll page + the "Pots" spend side.
- **Finance visibility** is tiered (§7): branch admins chase unpaid only;
  super-admins see revenue/analytics/exports.

---

## 15. Training, exams & levels

- **One 6-level ladder** everywhere: L1 Starter → L2 Beginner → L3 Intermediate →
  L4 Advanced → L5 Competition Team → L6 Elite Team. Canonical data in
  `src/lib/training.ts`. `students.level` (1-6) is the single source of standing;
  the old 4-tier `students.rank` column is **deprecated** (kept, unread).
- **Promotion exam** between levels: fixed 100-pt rubric (Technical 40 / Footwork
  25 / Game-or-Tactical 20 / Physical-Attitude 15). **≥70 promotes.** L6 = review.
- **Exam cycle:** quarterly, **Jan/Apr/Jul/Oct** (`EXAM_MONTHS = [1,4,7,10]`).
- **Eligibility gate:** ≥70% attendance over 90 days (min 4 sessions), enforced in
  UI and in `createLevelExam`.
- **Promotion is admin-only + one-way.** Coaches only *mark* (score +
  recommendation) at `/coach/exams`; admins promote at `/admin/exams`. Both log to
  `rank_events` and push the parent.
- **Syllabus is DB-editable** at `/admin/training` (per-level name/objective + full
  add/remove/rename of exam items per section, honoured only when section maxes
  still sum to the cap). Coach guidance ("How to test") is baked in from the brief.
- Branded exam-report **PDF** on the fly at `/api/exams/[id]/pdf`.

---

## 16. The Club business

A **separate business** run inside the same app (unparked and built out
2026-07-07). One legal entity, one Stripe account, one bank — separation is by
**tagging** (`business = 'academy' | 'club'` on `fee_plans` / `invoices` /
`payments` / `court_rentals`, plus Stripe `metadata.business` + statement
descriptor), not separate accounts.

Built and shipped:

- **Members** — super-admin CRUD at `/admin/club` (a hub) + **public self-signup**
  at `/club` (pick a tier → pay online via Stripe → webhook activates the member).
  Honeypot anti-spam.
- **Member portal** — passwordless `/club/me/[token]` (HMAC token = bearer
  credential): status, pay/renew dues, payment history, **court booking**.
- **Recurring dues** — `generateClubDuesCore()` mirrors the student biller, wired
  into the daily `generate-invoices` cron; manual "Generate dues" button.
- **Court booking** — members book a court/date/time; price = `hourly_rate` ×
  hours, overlap-checked server-side → pending booking + club invoice → checkout;
  paid → confirmed. Admin list + cancel at `/admin/club/bookings`.
- **Pots** — `/admin/pots` (super-only): per-arm (Academy / Club) collected,
  billed, outstanding, court cost, salaries, and available = collected − court −
  salaries; combined P&L.

Migrations `0043`→`0047` were applied; **`0048` (`court_rentals.business`) was
pending** as of the last note — verify it's applied. Full plan:
[`CLUB-PLAN-2026-07-06.md`](CLUB-PLAN-2026-07-06.md).

---

## 17. Backups & disaster recovery

- Daily `backup` cron writes a JSON snapshot of every table to the private
  `backups` Supabase Storage bucket, then prunes old message rows (kept in that
  day's snapshot).
- `scripts/backup-db.mjs` is a manual equivalent.
- **Restore path:** the snapshots are raw JSON per table — restoring means
  re-inserting into a fresh DB (no one-click restore built). Supabase's own
  point-in-time/backup features are the primary DR; these snapshots are a
  belt-and-braces export the owner controls.
- Losing `PARENT_AUTH_SECRET` logs out all parents (not data loss). Losing the
  WhatsApp session just needs a QR re-scan.

---

## 18. Known gaps & parked work

**Parked by owner (do NOT build until unpinned):**
- **Reward engine** (auto point rules) — manual + leaderboard only for now; a
  mockup is the reference.
- **Trial funnel.**
- **WhatsApp auto-add to Community group** — high ban risk (WhatsApp forces invite
  links); safer path is auto-sending the invite link on signup.

**Open / follow-ups:**
- Security TODOs in §7 (public student-photos bucket, leaked-password protection,
  branch-scope the remaining secondary tables).
- Dead code kept harmless: legacy `scorecards` / `assessments` / `growth` /
  `scorecard-pdf` pipeline; PIN login helpers in `parent-auth.ts`.
- `enforceStaffMfa()` makes a `listFactors` network call on every staff
  `requireRole` — cache later if it bites.
- Rotate `WA_WORKER_SECRET` (was once pasted in chat).
- Confirm the worker box has auto-login + Sleep=Never; confirm the old GCP VM is
  killed; confirm club migration `0048` is applied.

**Still-listed UX polish (from the roadmap, low priority):** progress photos,
referral, minor i18n coverage (zh currently covers parent nav/home/schedule/report
only — extend `src/lib/i18n.ts` when asked).

---

## 19. Key files index

| Path | What |
|------|------|
| `src/lib/auth.ts` | `getProfile`, `requireRole`, `requireSuperAdmin`, `isAdminRole`, MFA gate |
| `src/lib/constants.ts` | Nav structure (admin/coach/parent), role labels, page size |
| `src/lib/parent-auth.ts` / `parent-cookie-edge.ts` | Parent cookie sign/verify (node + edge) |
| `src/lib/club-auth.ts` | Club member token |
| `src/lib/branch.ts` | Branch listing + write-branch resolution + view switcher |
| `src/lib/billing.ts` / `club-billing.ts` | Invoice + club-dues generation cores |
| `src/lib/payments/` | Gateway interface + Stripe impl |
| `src/lib/whatsapp/` | Provider interface + `wwebjs` (worker) + `meta` (legacy) impls |
| `src/lib/reminders.ts` | Send policy / queue claiming / anti-ban window |
| `src/lib/push.ts` / `notifications.ts` | Web push + in-app bell |
| `src/lib/training.ts` / `syllabus.ts` / `exam-guide.ts` | Levels, exam specs, editable syllabus |
| `src/lib/pots.ts` / `payroll.ts` | Club/academy P&L + coach payroll |
| `src/lib/settings.ts` | `app_settings` accessors (kill switches, schedule, worker URL) |
| `src/lib/backup.ts` | Daily snapshot + prune |
| `src/middleware.ts` | Route gating (`/admin`, `/coach`, `/parent`) |
| `src/app/api/cron/*` | The five cron routes |
| `src/app/api/webhooks/stripe/route.ts` | Payment reconciliation |
| `src/app/api/worker/*` | Queue polling (`next`/`result`) + URL self-register |
| `wa-worker/server.mjs` / `tunnel.mjs` | The WhatsApp worker + tunnel self-registration |
| `supabase/migrations/*` | 50 migrations, `0001`→`0048` |

---

## 20. "When X breaks" quick reference

| Symptom | First check |
|---------|-------------|
| Pushed to GitHub, not live | Vercel → Settings → Git points at `Hide-and-Seeds/HongBadmintonAcademy`; check the build log. |
| No WhatsApp messages going out | Worker box up + logged in? `curl localhost:8787/health` → `ready:true`. `worker_paused` off in Settings? Re-link if `LOGOUT` in logs. |
| Community post didn't send | `WA_COMMUNITY_GROUP_ID` set + bot is a group admin? |
| Cron didn't run / 401 | `CRON_SECRET` matches in Vercel; check the route logs. |
| Payment didn't mark paid | Stripe webhook endpoint + `STRIPE_WEBHOOK_SECRET` correct; check webhook deliveries in the Stripe dashboard. |
| Parents all logged out | `PARENT_AUTH_SECRET` changed/rotated? |
| Super-admin can't log in | A hand-rolled `role === "admin"` check somewhere is missing super_admin — use `isAdminRole`. |
| Staff locked out by 2FA | Another super-admin resets it on the staff edit page, or use backup codes at `/login/2fa?mode=backup`. Keep ≥2 super-admins. |
| Worker box rebooted, nothing sends | Windows auto-login enabled? Startup script ran? Tunnel URL self-registered (check `app_settings.wa_worker_url`)? |

---

*This document is a snapshot. External state (Vercel/Stripe/Supabase/worker
access) must be re-verified by whoever takes over. Code-level claims were checked
against the repo on 2026-07-07; operational/account claims come from project
history and should be confirmed live.*
