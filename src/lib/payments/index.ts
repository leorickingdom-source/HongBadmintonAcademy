import "server-only";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

// Single switch point for the active gateway. Swap here (or read an env flag)
// when wiring iPay88 / eGHL.
export function getPaymentProvider(): PaymentProvider {
  return stripeProvider;
}

export type { CheckoutInput, CheckoutResult, PaymentProvider } from "./types";
