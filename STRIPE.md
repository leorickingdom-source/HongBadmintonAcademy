# Stripe Integration

Online fee payments for Hong Badminton Academy — Stripe Checkout (hosted page) +
signature-verified webhooks that reconcile invoices automatically.

## Status

- **Code:** complete — checkout, webhooks, reconciliation, per-parent customer
  reuse, and fee-plan → Stripe catalog sync.
- **Local env:** already configured with **sandbox test keys**. Verified — a test
  checkout session was created successfully via `scripts/stripe-smoke.mjs`.
- **Connected account:** `acct_1TesJv…` ("Hide and Seeds sandbox", test mode).
- **Seeded:** fee plan _Monthly — Junior_ mirrored to Stripe
  `prod_UfUQR2C6yKyD8h` / `price_1Tg9RlEMReabYyUwY8vLTOp4` (RM150/mo recurring).

## How a payment flows

1. Admin raises an invoice (**Admin → Invoices → New invoice**).
2. Parent opens **Fees & Payments** (or a child's **Package & Fees**) → **Pay now**.
3. `payInvoice` creates a Stripe Checkout session (one-time, MYR), attaches/creates
   a Stripe Customer for that parent, and redirects to Stripe's hosted page.
4. Parent pays. Stripe redirects back to `/parent/invoices?paid=1`.
5. Stripe POSTs a webhook to `/api/webhooks/stripe`. We verify the signature, mark
   the invoice **paid**, and insert a row in `payments` (idempotent on event id).

**Webhook events handled**

| Event | Effect |
|-------|--------|
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | invoice → `paid`, payment `succeeded` |
| `checkout.session.async_payment_failed` | invoice → `unpaid`, payment `failed` |
| `charge.refunded` | invoice → `refunded`, payment `refunded` |

## Environment variables

Set locally (`.env.local`) **and** in Vercel (Project → Settings → Environment Variables):

| Var | Scope | Notes |
|-----|-------|-------|
| `STRIPE_SECRET_KEY` | server | `sk_test_…` (sandbox) or `sk_live_…` (production). |
| `STRIPE_WEBHOOK_SECRET` | server | `whsec_…` signing secret of your webhook endpoint. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | `pk_…` — optional for redirect checkout; set it for future client-side Stripe.js. |
| `PAYMENT_CURRENCY` | server | default `MYR`. |

Local is already filled with sandbox keys. **For production, add the same (or live)
keys in Vercel and redeploy** — Vercel does not read `.env.local`.

## Webhook setup

**Local (Stripe CLI):**
```bash
stripe login
stripe listen --forward-to localhost:3030/api/webhooks/stripe
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET, then restart `next dev`
```

**Production (Stripe Dashboard → Developers → Webhooks → Add endpoint):**
- URL: `https://<your-domain>/api/webhooks/stripe`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `charge.refunded`
- Copy the endpoint's **Signing secret** → `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.

## Fee plan ↔ Stripe catalog

**Admin → Fee Plans** shows a Stripe status banner (mode + webhook) and a
**Sync to Stripe** button. Sync mirrors each active fee plan to a Stripe Product +
Price (monthly plans get a recurring price, ready for subscriptions later) and stores
the ids on the plan. Stored ids self-heal — if you switch Stripe accounts, re-sync
just creates fresh ones.

## Testing (test mode)

- Test card: `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
- More scenarios: https://stripe.com/docs/testing
- Verify the key any time: `node --env-file=.env.local scripts/stripe-smoke.mjs`
- Fire a webhook locally: `stripe trigger checkout.session.completed`

## Taking Stripe live — when the client gives their business details

Today the account is in **TEST mode** (fake money — the test keys, the sandbox
`acct_…`, and every existing `payments`/paid-invoice row are all pretend). Going
live has **two halves in order**: the **owner activates the business** in Stripe,
then the **developer swaps the keys**. The live keys will not settle real money
until activation is submitted and approved.

### Step 1 — OWNER: activate the account (the business details)

In the **real** Stripe Dashboard (not the sandbox), the client/owner completes
account activation. This is the "business details" hand-over:

- **Business:** legal name, business type, **SSM / registration number**, address.
- **Representative:** owner's name, DOB, and **ID (IC / passport)** for identity
  verification (KYC — Stripe is legally required to collect this).
- **Bank account (Malaysian)** for **payouts**, currency **MYR**.
- **Public details:** support email + **statement descriptor** (the short text
  that shows on the payer's card statement — set it so parents recognise it).
- **Submit for activation.** Stripe reviews (usually minutes to ~1 business day).
  Payouts only start once approved.

### Step 2 — DEVELOPER: get the LIVE keys + webhook

- Toggle the dashboard **out of Test mode** (top-right switch) → you're in **Live**.
- **Developers → API keys** → copy `sk_live_…` (secret) and `pk_live_…` (publishable).
- **Developers → Webhooks → Add endpoint:**
  - URL `https://hong-badminton-academy.vercel.app/api/webhooks/stripe`
  - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
    `checkout.session.async_payment_failed`, `charge.refunded`
  - Copy the endpoint's **live** signing secret `whsec_…`.

### Step 3 — DEVELOPER: update Vercel + redeploy

In **Vercel → Settings → Environment Variables** (Production), set the **live** values:

- `STRIPE_SECRET_KEY = sk_live_…`
- `STRIPE_WEBHOOK_SECRET = whsec_…` (the **live** endpoint's secret)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_…`
- `PAYMENT_CURRENCY = MYR`

Then **redeploy** — env changes don't take effect until a new deploy.

### Step 4 — DEVELOPER: payment methods + re-sync the catalog

- Stripe (Live) → **Settings → Payment methods** → enable **Cards + FPX + GrabPay**
  (the Malaysian methods you want).
- App → **Admin → Fee Plans** → the status banner should now read **LIVE** → click
  **Sync to Stripe**. Test products/prices do **not** carry over; this creates fresh
  live Product+Price ids and stores them (self-healing).

### Step 5 — Verify with one real transaction

- Raise a small real invoice → pay with a real card → confirm the webhook flipped it
  to **paid** (Admin → Invoices, and Stripe → Payments) → then **refund** it and
  confirm the invoice returns to refunded.

### Gotchas

- **Webhook secret is per-endpoint AND per-mode.** The test `whsec_` will not verify
  live events → payments succeed but invoices never flip to paid. This is the #1
  go-live mistake — double-check Step 3.
- **Test rows are fake.** Sandbox `payments` / paid invoices are not real money;
  real revenue starts only after go-live. The app distinguishes them via `stripeMode()`.
- **Payouts** land in the client's bank on Stripe's schedule (a longer hold on the
  first payout, then rolling) — verify under Settings → Payouts.
- **Rollback:** put the test keys back in Vercel + redeploy.

## Files

- `src/lib/payments/{index,stripe,types}.ts` — provider + helpers (checkout, customer
  reuse, fee-plan sync, `stripeMode()`).
- `src/app/(parent)/parent/invoices/actions.ts` — `payInvoice` (creates checkout).
- `src/app/api/webhooks/stripe/route.ts` — signature-verified webhook + reconciliation.
- `src/app/(admin)/admin/fee-plans/{page.tsx,actions.ts}` — status banner + Sync.
- `supabase/migrations/0005_stripe.sql` — `stripe_customer_id` / `stripe_product_id` /
  `stripe_price_id`.
- `scripts/stripe-smoke.mjs` — key/checkout smoke test.
