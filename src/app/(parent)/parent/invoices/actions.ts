"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import { env, isStripeConfigured } from "@/lib/env";

// Parent pays an invoice → create a Stripe Checkout session and redirect to it.
export async function payInvoice(formData: FormData) {
  const id = String(formData.get("id"));

  if (!isStripeConfigured()) {
    redirect(`/parent/invoices?error=${encodeURIComponent("Online payment is not configured yet.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, amount, currency, description, status, students(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!inv) redirect(`/parent/invoices?error=${encodeURIComponent("Invoice not found.")}`);
  if (inv.status === "paid") redirect(`/parent/invoices?error=${encodeURIComponent("Already paid.")}`);

  const studentName = (inv as any).students?.full_name ?? "your child";

  const checkout = await getPaymentProvider().createCheckoutSession({
    invoiceId: inv.id,
    amount: Number(inv.amount),
    currency: inv.currency,
    description: inv.description || `Academy fee — ${studentName}`,
    customerEmail: user?.email ?? null,
    successUrl: `${env.appUrl}/parent/invoices?paid=1`,
    cancelUrl: `${env.appUrl}/parent/invoices`,
  });

  await supabase
    .from("invoices")
    .update({ stripe_checkout_session_id: checkout.reference })
    .eq("id", inv.id);

  redirect(checkout.url);
}
