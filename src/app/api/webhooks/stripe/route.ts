import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isStripeConfigured } from "@/lib/env";

export const runtime = "nodejs";

// Stripe → us. Marks invoices paid and writes a reconciliation row.
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id ?? session.client_reference_id ?? null;
    const amount = (session.amount_total ?? 0) / 100;

    if (invoiceId) {
      await db
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
        })
        .eq("id", invoiceId);

      await db.from("payments").upsert(
        {
          invoice_id: invoiceId,
          amount,
          currency: (session.currency ?? env.paymentCurrency).toUpperCase(),
          provider: "stripe",
          provider_txn_id:
            typeof session.payment_intent === "string" ? session.payment_intent : session.id,
          provider_event_id: event.id,
          status: "succeeded",
          method: "card",
          raw: session as unknown as Record<string, unknown>,
        },
        { onConflict: "provider,provider_event_id" },
      );
    }
  }

  return NextResponse.json({ received: true });
}
