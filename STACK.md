# HBA — Backend & Services (What We Use)

> The infrastructure and third-party services behind the Hong Badminton Academy
> (HBA) Management System, and why each is here. For env-var values see
> [`HANDOVER.md`](HANDOVER.md) §3–§4; for code patterns see [`DEVELOPER.md`](DEVELOPER.md).
>
> **Last updated:** 2026-07-09.

---

## At a glance

| Service | Role | Where it runs | Plan / cost notes |
|---------|------|---------------|-------------------|
| **Vercel** | Hosts the web app + serverless functions + cron | Vercel cloud (region `sin1`, Singapore) | Confirm plan tier; usage-based |
| **Supabase** | Postgres database, Auth, Row-Level Security, file Storage | Supabase cloud (project `njxrxpdxttwuawsqvkku`) | Confirm plan tier; usage-based |
| **Stripe** | Card payments (hosted Checkout) | Stripe cloud | Per-transaction; currently **TEST/sandbox** |
| **WhatsApp worker** | Sends WhatsApp messages (unofficial) | The **academy's own Windows PC** | Self-hosted → free; ban risk (unofficial) |
| **Cloudflare Tunnel** | Public URL for the worker on that PC | Cloudflare (free tier) | Free; URL is ephemeral, self-registers |
| **Web Push (VAPID)** | Browser push notifications | Browser vendors' push services | Free |
| **GitHub** | Source control + CI trigger | `github.com/Hide-and-Seeds/HongBadmintonAcademy` | Free/standard |

Everything except the WhatsApp worker is fully managed cloud. The worker is the
**only self-hosted piece** and the biggest operational risk (see HANDOVER §12).

---

## 1. Hosting & compute — **Vercel**

- Hosts the **Next.js app** (server-rendered pages + React front-end) and every
  **serverless function** (API routes, server actions, webhooks, cron handlers).
- **Region `sin1`** (Singapore), pinned in `vercel.json`.
- **Deploys automatically** on every push to `main` via the GitHub integration
  (no CLI). The canonical URL is `https://hong-badminton-academy.vercel.app`.
- Also runs the **scheduled jobs** — Vercel Cron (see §7).
- **Not** a database and **not** a message sender — those are Supabase and the
  WhatsApp worker.

## 2. Database, Auth & Storage — **Supabase**

One Supabase project provides three things:

- **Postgres** — every table (~45 across `supabase/migrations/*`). Access is
  guarded by **Row-Level Security (RLS)** policies, not app code alone.
- **Auth** (GoTrue) — email + password logins for **staff** (admins, coaches),
  plus native **TOTP 2FA**. Parents & club members do **not** use Supabase
  sessions — the app issues its own signed cookie (see HANDOVER §7).
- **Storage** — file buckets: `student-photos` (currently public), `leave-docs`
  (private, doctor's notes), `backups` (private, nightly DB snapshots),
  `scorecards`, `avatars`.
- API keys use the **new format** (`sb_publishable_…` browser key,
  `sb_secret_…` / service-role key server-only — bypasses RLS, never ship to the
  browser).

## 3. Payments — **Stripe**

- **Hosted Checkout** (redirect) — HBA never handles card numbers.
- Behind a **gateway-agnostic interface** (`src/lib/payments`) so a Malaysian
  gateway (iPay88 / eGHL) can be swapped in later.
- Currency **MYR**. Currently a **TEST/sandbox** account.
- Payments are reconciled by a **webhook** (`checkout.session.completed` →
  `/api/webhooks/stripe`), verified with `STRIPE_WEBHOOK_SECRET`.

## 4. Messaging

Two independent channels:

- **WhatsApp — `whatsapp-web.js` worker (unofficial).** A small **Express**
  service (`wa-worker/`) drives a real Chrome via **puppeteer** to send from a
  dedicated WhatsApp number. It runs on the **academy's Windows PC**, not Vercel
  (serverless can't hold a browser session). Chosen to avoid Meta's Cloud API
  business verification + per-message cost — the trade-off is **ban risk**, so
  the app drips messages under an anti-ban policy (`src/lib/reminders.ts`).
  - App ↔ worker talk over a shared bearer secret (`WA_WORKER_SECRET`).
  - The worker's public URL is an **ephemeral Cloudflare Tunnel** that
    **self-registers** into `app_settings.wa_worker_url` on start.
  - A **legacy Meta Cloud API** provider exists behind the same interface but is
    **unused** (kept for a future verified-business path).
- **Web Push (VAPID)** — `web-push` sends browser/PWA notifications (fee
  reminders, cover requests, rank-ups). Free, opt-in, no third-party account.

## 5. Runtime & framework

| Piece | Version | Notes |
|-------|---------|-------|
| **Next.js** | ^15 (App Router) | Server Components + Server Actions |
| **React** | ^19 | |
| **TypeScript** | latest | `npm run typecheck` = `tsc --noEmit` |
| **Node.js** | 24 (portable) | No global Node on the dev box — portable at `.tools/` |
| **Tailwind CSS** | v4 (`@tailwindcss/postcss`) | Styling |

## 6. Key libraries

- **`@supabase/ssr` + `@supabase/supabase-js`** — DB/Auth clients (cookie sessions).
- **`stripe`** — payments SDK. **`web-push`** — VAPID push. **`zod`** — input validation.
- **`pdf-lib`** — exam reports / invoices / score cards (rendered on the fly).
- **`recharts`** — analytics charts. **`lucide-react`** — icons. **`qrcode`** — WA/join QR codes.
- Worker: **`whatsapp-web.js`** (^1.23) + **`express`** + puppeteer/Chrome.

## 7. CI/CD & scheduled jobs

- **Source control:** GitHub (`Hide-and-Seeds/HongBadmintonAcademy`, branch `main`).
- **CI/CD:** Vercel's GitHub integration — **push to `main` → build → deploy**.
  No manual CLI deploys (owner wants git-based CI/CD).
  ⚠️ A deploy does **not** run DB migrations — apply those separately (HANDOVER §5).
- **Cron:** **Vercel Cron** (in `vercel.json`, region `sin1`, each gated by
  `CRON_SECRET`). Six jobs (times UTC):

  | Job | UTC | Does |
  |-----|-----|------|
  | `flag-absences` | `0 16` | Close sessions, flag late/absent, overdue invoices |
  | `enqueue-reminders` | `0 1` | Web-push fee reminders |
  | `generate-invoices` | `0 3` | Monthly fee invoices + community notice + club dues |
  | `generate-sessions` | `0 2` | Materialize sessions from weekly schedules |
  | `backup` | `0 18` | Snapshot every table → `backups` bucket, prune old rows |
  | `exam-window` | `0 1 1 1,4,7,10` | Open the quarterly promotion-exam window |

## 8. Other integrations

- **NFC attendance** — a reader/bridge POSTs taps to `/api/nfc/tap` with header
  `x-api-key: <NFC_API_KEY>`. No third-party service; just a shared secret.
- **Secrets & config** — all in **Vercel → Environment Variables** (never in
  git). The worker's secrets live in `wa-worker/.env` on the PC. Full list:
  HANDOVER §4.

---

## What breaks if each goes down

| If this is down… | Effect |
|------------------|--------|
| **Vercel** | Whole app + crons offline |
| **Supabase** | App can't read/write anything (DB + auth + files) |
| **Stripe** | Parents can't pay online; everything else works |
| **WhatsApp worker / its PC** | WhatsApp messages queue up (nothing lost); push + in-app still work |
| **Cloudflare tunnel** | App can't reach the worker → same as worker down |
| **GitHub** | Can't deploy new code; the live site keeps running |

---

*Snapshot — confirm plan tiers and account access live before relying on them.
Pairs with [`HANDOVER.md`](HANDOVER.md) (full handover), [`DEVELOPER.md`](DEVELOPER.md)
(code patterns) and [`OPERATIONS.md`](OPERATIONS.md) (day-to-day).*
