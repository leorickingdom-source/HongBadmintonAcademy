import "server-only";
import Stripe from "stripe";
import { env, isStripeConfigured } from "@/lib/env";
import type { CheckoutInput, CheckoutResult, PaymentProvider } from "./types";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured (set STRIPE_SECRET_KEY).");
  }
  if (!_stripe) _stripe = new Stripe(env.stripeSecret);
  return _stripe;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.invoiceId,
      customer_email: input.customerEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: Math.round(input.amount * 100), // major → minor units
            product_data: { name: input.description },
          },
        },
      ],
      metadata: { invoice_id: input.invoiceId },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, reference: session.id };
  },
};
