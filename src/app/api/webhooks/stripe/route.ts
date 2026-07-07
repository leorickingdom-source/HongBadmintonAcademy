import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmins } from "@/lib/notifications";
import { env, isStripeConfigured } from "@/lib/env";

export const runtime = "nodejs";

type DB = ReturnType<typeof createAdminClient>;

function piId(pi: string | Stripe.PaymentIntent | null | undefined): string | null {
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

// Idempotent payment insert keyed on the Stripe event id (the partial unique
// index can't be inferred for ON CONFLICT, so we check-then-insert).
async function recordPayment(
  db: DB,
  p: {
    invoiceId: string;
    eventId: string;
    amount: number;
    currency: string;
    txnId: string | null;
    status: "succeeded" | "failed" | "refunded";
    method?: string | null;
    business?: string | null;
    raw: Record<string, unknown>;
  },
) {
  const { data: exists } = await db
    .from("payments")
    .select("id")
    .eq("provider", "stripe")
    .eq("provider_event_id", p.eventId)
    .maybeSingle();
  if (exists) return;

  await db.from("payments").insert({
    invoice_id: p.invoiceId,
    amount: p.amount,
    currency: p.currency.toUpperCase(),
    provider: "stripe",
    provider_txn_id: p.txnId,
    provider_event_id: p.eventId,
    status: p.status,
    method: p.method ?? null,
    business: p.business ?? "academy",
    raw: p.raw,
  });
}

// Stripe → us. Reconciles invoices + writes payment rows for the lifecycle.
export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig ?? "", env.stripeWebhookSecret);
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }

  const db = createAdminClient();

  switch (event.type) {
    // Paid — sync (card) or async (e.g. FPX/bank) settlement.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const invoiceId = s.metadata?.invoice_id ?? s.client_reference_id ?? null;
      if (invoiceId) {
        const { data: updatedInv } = await db
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: s.id,
            stripe_payment_intent_id: piId(s.payment_intent),
          })
          .eq("id", invoiceId)
          .select("business, club_member_id")
          .maybeSingle();

        await recordPayment(db, {
          invoiceId,
          eventId: event.id,
          amount: (s.amount_total ?? 0) / 100,
          currency: s.currency ?? env.paymentCurrency,
          txnId: piId(s.payment_intent) ?? s.id,
          status: "succeeded",
          method: "card",
          business: (updatedInv as any)?.business ?? s.metadata?.business ?? "academy",
          raw: s as unknown as Record<string, unknown>,
        });

        // Public club self-signup: first dues paid → activate the member.
        const clubMemberId = (updatedInv as any)?.club_member_id ?? null;
        if (clubMemberId) {
          await db.from("club_members").update({ status: "active" }).eq("id", clubMemberId);
        }
        // Court booking paid → confirm the reservation.
        await db.from("court_bookings").update({ status: "confirmed" }).eq("invoice_id", invoiceId).eq("status", "pending");
        await notifyAdmins({
          type: "payment",
          title: "Payment received",
          body: `${((s.amount_total ?? 0) / 100).toFixed(2)} ${(s.currency ?? env.paymentCurrency).toUpperCase()} paid online.`,
          url: "/admin/invoices",
        });
      }
      break;
    }

    // Async payment did not clear — revert to unpaid so it can be retried.
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const invoiceId = s.metadata?.invoice_id ?? s.client_reference_id ?? null;
      if (invoiceId) {
        await db.from("invoices").update({ status: "unpaid" }).eq("id", invoiceId);
        await recordPayment(db, {
          invoiceId,
          eventId: event.id,
          amount: (s.amount_total ?? 0) / 100,
          currency: s.currency ?? env.paymentCurrency,
          txnId: piId(s.payment_intent) ?? s.id,
          status: "failed",
          method: "card",
          business: s.metadata?.business ?? "academy",
          raw: s as unknown as Record<string, unknown>,
        });
      }
      break;
    }

    // Refund issued in the Stripe dashboard → mark the invoice refunded.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi = piId(charge.payment_intent);
      let invoiceId: string | null = null;
      let refundBusiness: string | null = null;
      if (pi) {
        const { data: pay } = await db
          .from("payments")
          .select("invoice_id, business")
          .eq("provider", "stripe")
          .eq("provider_txn_id", pi)
          .eq("status", "succeeded")
          .limit(1)
          .maybeSingle();
        invoiceId = (pay?.invoice_id as string | undefined) ?? null;
        refundBusiness = (pay as any)?.business ?? null;
      }
      if (invoiceId) {
        await db.from("invoices").update({ status: "refunded" }).eq("id", invoiceId);
        await recordPayment(db, {
          invoiceId,
          eventId: event.id,
          amount: (charge.amount_refunded ?? 0) / 100,
          currency: charge.currency ?? env.paymentCurrency,
          txnId: pi,
          status: "refunded",
          method: "card",
          business: refundBusiness ?? "academy",
          raw: charge as unknown as Record<string, unknown>,
        });
      }
      break;
    }

    default:
      // Other events are acknowledged but ignored.
      break;
  }

  return NextResponse.json({ received: true });
}
