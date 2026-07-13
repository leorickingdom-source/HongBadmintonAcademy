# HBA — Developer & Maintainer Guide

> For the engineer who will **maintain and extend the code**. Product/operations
> handover is in [`HANDOVER.md`](HANDOVER.md); system + ER diagrams are in
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). This doc is the "how the code
> works and how to change it safely" companion.
>
> **Last updated:** 2026-07-07.

---

## 1. Mental model

A **stateless Next.js 15 app on Vercel** that owns all data access to **Supabase**
(Postgres + Auth + Storage + RLS). Two things live *outside* Vercel:

- **Stripe** (checkout + webhook) for money.
- An always-on **`whatsapp-web.js` worker** on a Windows box for WhatsApp. Vercel
  only *queues* WhatsApp; the worker sends. (See [`HANDOVER.md`](HANDOVER.md) §12.)

Everything else — attendance, marking, exams, billing, the Club business — is
plain App-Router code + Postgres. There is **no ORM**: data access is the
`supabase-js` query builder, and **authorization is mostly Postgres RLS**.

Three audiences, one codebase, split by route group: `(admin)`, `(coach)`,
`(parent)`.

---

## 2. Get productive in ~10 minutes

This machine has **no global Node** — a portable one lives at
`.tools/node-v24.16.0-win-x64` (gitignored). Prepend it every PowerShell session
(shell state does not persist between tool calls):

```powershell
$env:Path = "D:\HBA\.tools\node-v24.16.0-win-x64;" + $env:Path
```

```powershell
npm install
# fill .env.local from .env.local.example (Supabase URL + anon + service-role at minimum)
npx next dev            # http://localhost:3000
npm run typecheck       # tsc --noEmit — run this before every commit
npm run lint            # next lint
npm run build           # next build — what Vercel runs
```

**Database:** migrations in `supabase/migrations/*` (51 files, `0001`→`0049`).

- Hosted: `npx supabase link --project-ref njxrxpdxttwuawsqvkku` then
  `npx supabase db push`.
- Local (needs Docker): `npx supabase start` + `npx supabase db reset` (applies
  migrations **and** `seed.sql` demo data).

**First admin (no seed):** `node scripts/create-admin.mjs <email> <pw> "Name"`
creates a **branch admin** — promote to super-admin separately (see
[`HANDOVER.md`](HANDOVER.md) §7). **Demo logins** (local seed, password
`Password123!`): `admin@hba.test`, `coach1@hba.test`, `parent1@hba.test`.

> The Bash tool has no Node — use PowerShell for anything Node-related. The
> Windows PowerShell tool mangles `git commit -m` text containing double-quotes;
> use single-quoted messages or a heredoc.

---

## 3. Repo layout

```
src/
  app/
    (admin)/admin/…      Admin portal. layout.ts does requireRole("admin").
    (coach)/coach/…      Coach portal. requireRole("coach").
    (parent)/parent/…    Parent portal. requireParent() (cookie, no Supabase session).
    club/…               Public club signup + passwordless member portal.
    trial/…              Public free-trial funnel → admin lead inbox (/admin/leads).
    api/
      cron/*             5 cron routes, CRON_SECRET-gated.
      webhooks/stripe    Payment reconciliation (signature-verified).
      worker/*           Queue poll (next/result) + worker URL self-register.
      nfc/tap            NFC ingest (x-api-key).
      {exams,invoices,monthly-card,scorecards}/[id]/pdf   on-the-fly PDFs.
    login, parent-login  Auth surfaces (unified at /login).
  lib/
    supabase/            client.ts (RLS) · admin.ts (service role) · server.ts · middleware.ts
    auth.ts              requireRole / requireSuperAdmin / isAdminRole / MFA gate
    parent-auth.ts       parent cookie sign/verify + requireParent
    branch.ts            branch listing + resolveWriteBranch + view switcher
    payments/            gateway interface + Stripe impl (swap point)
    whatsapp/            provider interface + wwebjs + meta (legacy) impls
    reminders.ts push.ts notifications.ts   the 3 notification channels
    billing.ts club-billing.ts pots.ts payroll.ts   money
    training.ts syllabus.ts exam-guide.ts   levels + exams
    settings.ts          app_settings accessors (kill switches, schedule, worker URL)
    validation.ts        zod schemas   ·   types.ts   hand-maintained app types
    constants.ts         nav (ADMIN_NAV/COACH_NAV/PARENT_NAV), ROLE_LABEL, PAGE_SIZE
  middleware.ts          route gating for /admin /coach /parent
supabase/migrations/*    NNNN_name.sql, forward-only
wa-worker/               the external WhatsApp worker (own package.json, excluded from build)
scripts/                 *.mjs one-off tools (create-admin, stripe smoke, backups, checks)
docs/ARCHITECTURE.md     diagrams
```

---

## 4. The data-access model — read this before touching queries

There are **three** Supabase clients. Picking the wrong one is the #1 security
footgun.

| Client | File | Runs as | Use for |
|--------|------|---------|---------|
| `createClient()` | `supabase/server.ts` | the signed-in **staff** user (`authenticated`) | admin + coach pages/actions. **RLS enforces access** — a branch admin auto-sees only their branch, a coach only their classes, with no per-query code. |
| `createAdminClient()` | `supabase/admin.ts` | **service role — RLS bypassed** | parent/club pages, crons, webhooks, worker routes, NFC, and cross-cutting writes (e.g. `rank_events`). |
| middleware client | `supabase/middleware.ts` | request cookie refresh | middleware only. |

**The rule:**

- **Staff paths → RLS client.** Let Postgres do authorization. Safe by default.
- **Service-role paths → you are the authorization.** Every query MUST be scoped
  by hand. For parents that means filtering by the cookie-resolved id:
  `getParentIdFromCookie()` / `requireParent()` → filter `parent_id = me.id` (or
  the parent's own children). **That filter is the access boundary — never drop
  it.** (See [`HANDOVER.md`](HANDOVER.md) §7 and the `hba-authz-model` note.)

RLS helper functions in Postgres (used by policies): `is_admin()` (= admin **or**
super_admin), `is_super_admin()`, `coach_of_class/student/makeup`,
`parent_of_student`, `admin_branch_ok(branch_id)`, `admin_of_class/session/student`.

---

## 5. Authorization — the non-negotiable guards

Enforced in `src/lib/auth.ts`. **Four invariants. Break one and a vuln regresses:**

1. **Server Actions are standalone POST endpoints — the route-group layout guard
   does NOT protect them.** The `(admin)` layout's `requireRole("admin")` only
   guards page *render*. **Every action that uses `createAdminClient()` must call
   `await requireRole("admin")` (or `requireSuperAdmin()`) as its first line.**
2. **Never write a bare `role === "admin"`** — super-admins fail it. Use
   `isAdminRole(role)` or include `"super_admin"`. `requireRole("admin")`
   auto-allows super_admin; hand-rolled checks don't.
3. **Mutating `SECURITY DEFINER` functions guard in-function**
   (`if not (auth.uid() is null or is_admin()) then raise`) + `revoke execute … from anon`.
4. **Parent/club service-role scoping** (§4) — the manual `parent_id` filter is
   the boundary.

`requireRole`/`requireSuperAdmin` also run the **2FA gate** (`enforceStaffMfa`):
a staff session with a verified TOTP factor that hasn't cleared 2FA this session
is bounced to `/login/2fa`; if the academy requires 2FA and the account has no
factor, to `/login/2fa/setup`. Parents (cookie auth) never hit MFA.

---

## 6. Anatomy of a server action (the canonical pattern)

Copy this shape. Real example: `src/app/(admin)/admin/students/actions.ts`.

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";   // RLS client
import { createAdminClient } from "@/lib/supabase/admin"; // service role, for cross-cutting writes
import { requireRole } from "@/lib/auth";
import { resolveWriteBranch } from "@/lib/branch";
import { studentSchema } from "@/lib/validation";

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`); // errors surface via ?error= in the page
}

export async function createStudent(formData: FormData) {
  const me = await requireRole("admin");                 // 1. GUARD FIRST (also runs the MFA gate)
  const parsed = studentSchema.safeParse(Object.fromEntries(formData)); // 2. validate with zod
  if (!parsed.success) err("/admin/students/new", parsed.error.issues[0].message);

  const branch_id = await resolveWriteBranch(me, parsed.data.branch_id); // 3. server stamps branch authoritatively
  const supabase = await createClient();                 // 4. RLS client for the main write
  const { error } = await supabase.from("students").insert({ ...parsed.data, branch_id });
  if (error) err("/admin/students/new", error.message);

  try { /* notifications / rank_events via createAdminClient() */ }     // 5. side-effects in try/catch —
  catch { /* never block the primary write */ }                        //    a feed/push write must never fail the action
  revalidatePath("/admin/people");                       // 6. revalidate affected pages
  redirect("/admin/students");
}
```

Key points: **guard first**, validate with **zod** (`src/lib/validation.ts`),
**server stamps the branch** (never trust the client — `resolveWriteBranch` forces
a branch admin to their own branch and lets super pick), RLS client for the write,
**best-effort side-effects** in try/catch, `revalidatePath` at the end. Forms use
`SubmitButton` for pending state and read `?error=` for failures.

---

## 7. Cookbook — how to add X

### A new admin page
Create `src/app/(admin)/admin/<thing>/page.tsx` (a server component; use the RLS
client so branch scoping is automatic). Add a nav entry in `ADMIN_NAV`
(`src/lib/constants.ts`); set `superOnly: true` to hide it from branch admins. The
`(admin)/layout` already guards the render; **still guard each action** (§5.1).

### A new server action
Follow §6. First line `await requireRole("admin")` / `requireSuperAdmin()`.

### A new table + migration
Add `supabase/migrations/00NN_name.sql` (next number, forward-only). Include:
- the table, with `branch_id uuid references public.branches(id)` if it is
  branch-scoped;
- `alter table … enable row level security;`
- policies using the helper fns (`is_admin()`, `is_super_admin()`,
  `coach_of_*`, `admin_branch_ok(branch_id)` for branch scoping);
- update `src/lib/types.ts` (hand-maintained) — or run `npm run db:types`.

Apply with `npx supabase db push` (or the owner applies via the Supabase
dashboard/MCP — historically that is how remote migrations landed here). **Enum
gotcha:** you cannot use a newly-added enum value in the same transaction that
adds it — put `alter type … add value` in its **own** migration (see `0030`).

### Branch-scope an existing table
Use `admin_branch_ok(branch_id)` in the admin policy (direct `branch_id`), or
`admin_of_class/session/student(...)` when the branch lives on a parent row. See
`0038`/`0031`. Coach/parent policies stay keyed on `coach_of_*` / the parent id.

### The coach check-in geofence
Per-branch: `branches.lat/lng/geofence_radius_m/geofence_enabled/geofence_required`
(migration `0060`). `src/lib/geofence.ts` `getBranchGeofence(branchId)` is the
single source of truth (branch overrides → env `ACADEMY_*` fallback → off). The
server guard lives in `setCoachCheckin` (`checkin/board-actions.ts`): it resolves
the session's branch geofence and rejects an out-of-radius tap, subtracting the
device's GPS accuracy so a fuzzy fix doesn't false-reject. Proof is stored on
`coach_checkins` (`lat/lng/distance_m`, `method='self_geo'`) and surfaced on the
admin coverage page. Admins set a venue's coords from **Admin → Branches → Edit →
"Use my current location"**. Coaches get a live on-site chip on the check-in
board plus a self-test at **`/coach/checkin/geo-check`**.
**Browser geolocation needs a secure context** — it only works on HTTPS or
`localhost`. Testing on a phone over the LAN (`http://192.168.x.x`) returns no
position; use the deployed HTTPS URL (or a tunnel).

### A new cron
Route `src/app/api/cron/<name>/route.ts` — first check the secret:
```ts
if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
  return new Response("Unauthorized", { status: 401 });
```
Register it in `vercel.json` (`schedule` is **UTC**; MYT = +8). Keep it
idempotent (the existing crons are, so manual "Generate this month" buttons can
reuse the same core safely).

### A notification
Three channels (`HANDOVER.md` §13). In code:
- **In-app bell:** `createNotifications` / `notifyAdmins` / `notifyCoachesOfClass`
  (`src/lib/notifications.ts`). `notifyAdmins` includes super_admins.
- **Web push:** `pushToUsers(profileIds, payload)` (`src/lib/push.ts`) —
  service-role, works for parents with no session, prunes 410-gone subs.
- Always wrap in try/catch — a notification must never break the primary flow.

### A WhatsApp send
Go through `getWhatsappProvider()` (`src/lib/whatsapp`) — it returns the wwebjs
worker provider when `isWaWorkerConfigured()`, else the (stubbed) Meta provider.
- **Queued/drip** (default, safest): write a `message_queue` row; the worker
  polls and sends under the anti-ban policy in `src/lib/reminders.ts`.
- **Instant** (announcements, cancel notices): `getWhatsappProvider().send(...)`
  with a `message_queue` fallback when the worker is offline.
- **Never** add a per-parent fee/money DM — that was removed as the top ban risk;
  use push instead.

### A new payment gateway (iPay88 / eGHL)
Add an impl in `src/lib/payments/` implementing the `PaymentProvider` interface
(`types.ts`), then wire it into `getPaymentProvider()` (`index.ts`). No caller
changes — everything goes through the interface.

### A translated string
Add the key to the flat dict in `src/lib/i18n.ts` (`dict(locale)`; zh falls back
to en per key, no library). Coverage today is parent nav/home/schedule/report;
extend outward when asked.

---

## 8. Migrations & DB conventions

- **Naming:** `NNNN_snake_name.sql`, zero-padded, sequential, **forward-only** (no
  down migrations; the repo has never rolled one back).
- **RLS everywhere.** Every table enables RLS and defines explicit policies. Reuse
  the helper functions rather than re-deriving membership.
- **Helper fns are `SECURITY DEFINER`.** Pure readers (`is_admin`, `coach_of_*`)
  are anon-executable but only return the caller's own membership. Mutating
  definers guard in-function + `revoke … from anon`.
- **Triggers (`0002`):** new `auth.users` row → `profiles` row; invoice insert →
  `invoice_no`; any update → `updated_at`.
- Advisors after DDL usually flag the SECURITY DEFINER helpers — that's the known
  accepted class, not a new hole (see `hba-authz-model`). Verify no *new* WARN.

---

## 9. Conventions & style

- **Server components by default;** add `"use client"` only for interactivity.
  Server-safe constants (e.g. `PAGE_SIZE`) must live in a server-safe module, not
  a `"use client"` file (a client const resolves to `undefined` on the server).
- **Types:** app types are hand-maintained in `src/lib/types.ts`; generated DB
  types via `npm run db:types` → `src/lib/types/database.ts`.
- **Validation:** zod schemas in `src/lib/validation.ts`.
- **Errors → UX:** actions `redirect('<path>?error=<msg>')`; pages render the
  banner. Success flips a status badge / redirects.
- **Base URL is request-derived** (`src/lib/url.ts`, reads `x-forwarded-host`) so
  Stripe redirects + links auto-correct; `NEXT_PUBLIC_APP_URL` is a fallback.
- **PDFs** are rendered on the fly with `pdf-lib` and served via RLS-checked
  routes that 302 to a short-lived signed URL (pattern: exam/invoice/scorecard).

---

## 10. Footguns — the hours-costers

- **Service worker must NEVER cache HTML navigations.** Auth/role routing is
  dynamic; caching it once served stale login/role pages. Only `/_next/static/*`
  is cache-first (`public/sw.js`). Bump the cache name on SW changes.
- **`.vercelignore` needs leading-slash anchors.** Unanchored `supabase` also
  matched `src/lib/supabase/` and broke the build — use `/supabase`, `/wa-worker`.
- **Invoice idempotency can't `onConflict` a *partial* unique index** — Postgres
  can't infer it. Do an explicit "already exists?" check + insert (see the Stripe
  webhook + `uq_invoices_*` indexes).
- **Enum value unusable in the same transaction it's added** → own migration
  (`0030`).
- **wwebjs needs a real Chrome via `CHROME_PATH`;** modern puppeteer doesn't
  auto-download it. A half-downloaded `~/.cache/puppeteer` blocks reinstall —
  delete it first. `npx puppeteer browsers install chrome` pulls a mismatched
  build — don't.
- **pm2 doesn't inherit shell env** → the worker calls `process.loadEnvFile()`;
  without it secrets are unset and it crash-loops.
- **`super_admin` must satisfy every strict admin check** (§5.2).
- **Parent pages must keep the `parent_id` filter** (§4).
- **RLS null-embed on cross-table joins.** If a role can read a *row* via one
  policy but you `select("…, other_table(…)")` an FK whose table has its own
  *stricter* RLS, PostgREST silently returns the embed as **null** — no error.
  A coach could read an open `coach_leave_requests` row but not its `sessions`
  embed (they don't coach that class), so `if (!l.sessions) continue` dropped
  every open cover and the "Cover requests" list was always empty (fixed
  `ade93fa`). When the outer row is visible under a broad policy but the joined
  table isn't, **hydrate the detail with the service-role client** instead of
  trusting the join. Two RLS policies that reference *each other's* tables can
  also deadlock into `infinite recursion detected in policy` — wrap the
  cross-table check in a `security definer` fn (see `0056`).
- **Don't reference `sessions` (or any table whose policy back-references this
  one) inline in an RLS `USING`/`WITH CHECK`** — use a `security definer` helper
  (`replacement_covers_class`, `coach_of_replacement`). `0053` inlined a
  `join sessions` into `enrollments_select` while `sessions_select` subqueried
  `enrollments` → recursion → **every** authed sessions read errored (empty
  calendar app-wide). Fixed in `0056`.

---

## 11. Dead code & do-not-reuse

These exist but are **not** the live path — don't extend them:

- Legacy monthly-report pipeline: `src/lib/scorecards.ts`, `growth.ts`,
  `scorecard-pdf.ts` and the `scorecards` / `assessments` / `assessment_scores` /
  `weekly_marks` tables. **Live progress = `session_marks` + `monthly_assessments`
  + `level_exams`.**
- `students.rank` column + the old 4-tier rank vocabulary — **deprecated**; the
  single ladder is `students.level` (1-6). `src/lib/ranks.ts` was repurposed as
  the class/fee *tier* vocabulary.
- PIN-login helpers in `parent-auth.ts` (`checkPhonePin`, `setPin`, …) — only
  `create/consumeLoginToken` (admin magic link) is still wired.
- `reward_rules.config` jsonb + the reward *engine* — parked (manual + leaderboard
  only). Don't build auto-rules until the owner unpins.

**Parked features (do not build):** reward engine, WhatsApp auto-add-to-group
(ban risk — auto-send an invite link instead). *(The trial funnel is now
SHIPPED — public `/trial` with a real session picker, admin Leads inbox, convert,
cancel; see HANDOVER §8/§9.)*

---

## 12. Build, verify, deploy

- **Before commit:** `npm run typecheck` (strict TS) + `npm run lint`.
- **Deploy = push to `main`** on `Hide-and-Seeds/HongBadmintonAcademy`; Vercel's
  GitHub integration builds + deploys. **No `vercel` CLI / one-off deploys.** Env
  vars live in Vercel, not git. Use the canonical alias
  `hong-badminton-academy.vercel.app` (per-deploy `-<hash>-` URLs are frozen).
- If "pushed but not live", Vercel → Settings → Git must point at the current
  repo path (it broke once after the org move).

---

## 13. Scripts (`scripts/*.mjs`)

Run with the portable Node and `--env-file=.env.local` where they need keys:

| Script | Purpose |
|--------|---------|
| `create-admin.mjs` | Bootstrap a branch admin on a hosted project |
| `backup-db.mjs` | Manual JSON snapshot of all tables |
| `stripe-smoke.mjs` / `stripe-webhook-test.mjs` / `stripe-verify-loop.mjs` | Stripe checks |
| `check-ledger.mjs` / `check-phones.mjs` / `reset-invoice.mjs` | Data sanity / fixups |
| `verify-pdf.mjs` | Confirm a valid PDF was produced |
| `whatsapp-test.mjs` | Direct worker `/send` test |

---

*Pair this with [`HANDOVER.md`](HANDOVER.md) (product + operations) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (diagrams). Code-level claims were
checked against the repo on 2026-07-07; verify against current code before
relying on a specific file/line.*
