// Gateway-agnostic payment interface. Stripe is the concrete impl today;
// iPay88 / eGHL can implement the same interface later without touching callers.

export interface CheckoutInput {
  invoiceId: string;
  amount: number; // major units, e.g. 150.00 MYR
  currency: string; // e.g. "MYR"
  description: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string; // hosted payment page to redirect the parent to
  reference: string; // provider session/order id
}

export interface PaymentProvider {
  readonly id: "stripe" | "ipay88" | "eghl";
  createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult>;
}
