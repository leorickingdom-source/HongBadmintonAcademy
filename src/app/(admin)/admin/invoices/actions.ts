"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { invoiceSchema } from "@/lib/validation";
import { getPaymentProvider } from "@/lib/payments";
import { getWhatsappProvider } from "@/lib/whatsapp";
import { isStripeConfigured } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { formatCurrency, formatDate } from "@/lib/format";

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createInvoice(formData: FormData) {
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err("/admin/invoices/new", parsed.error.issues[0].message);
  const supabase = await createClient();

  let parentId = parsed.data.parent_id;
  if (!parentId && parsed.data.student_id) {
    const { data: s } = await supabase
      .from("students")
      .select("parent_id")
      .eq("id", parsed.data.student_id)
      .maybeSingle();
    parentId = s?.parent_id ?? null;
  }

  const { error } = await supabase.from("invoices").insert({
    ...parsed.data,
    parent_id: parentId,
    period_month: new Date().toLocaleDateString("en-CA").slice(0, 8) + "01",
  });
  if (error) err("/admin/invoices/new", error.message);

  revalidatePath("/admin/invoices");
  redirect("/admin/invoices");
}

export async function markPaid(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select("amount, currency")
    .eq("id", id)
    .maybeSingle();

  await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id);

  if (inv) {
    await supabase.from("payments").insert({
      invoice_id: id,
      amount: inv.amount,
      currency: inv.currency,
      provider: "manual",
      status: "succeeded",
      method: "manual",
    });
  }
  revalidatePath("/admin/invoices");
}

export async function deleteInvoice(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", id);
  revalidatePath("/admin/invoices");
}

// Generate a payment link + send a WhatsApp reminder (logged either way).
export async function sendReminder(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, amount, currency, due_date, parent_id, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone, email)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!inv) err("/admin/invoices", "Invoice not found");
  const parent: any = (inv as any).parent;
  const studentName = (inv as any).students?.full_name ?? "your child";
  if (!parent?.phone) err("/admin/invoices", "Parent has no phone number on file");

  // Build a payment link (Stripe Checkout when configured).
  const baseUrl = await getBaseUrl();
  let link = `${baseUrl}/parent/invoices`;
  if (isStripeConfigured()) {
    try {
      const checkout = await getPaymentProvider().createCheckoutSession({
        invoiceId: inv.id,
        amount: Number(inv.amount),
        currency: inv.currency,
        description: `Academy fee — ${studentName}`,
        customerEmail: parent.email,
        successUrl: `${baseUrl}/parent/invoices?paid=1`,
        cancelUrl: `${baseUrl}/parent/invoices`,
      });
      link = checkout.url;
      await supabase
        .from("invoices")
        .update({ stripe_checkout_session_id: checkout.reference })
        .eq("id", inv.id);
    } catch {
      /* fall back to portal link */
    }
  }

  const text =
    `Hi ${parent.full_name ?? "Parent"}, this is a reminder that the fee of ` +
    `${formatCurrency(Number(inv.amount), inv.currency)} for ${studentName} ` +
    `is due ${formatDate(inv.due_date)}. Pay here: ${link}`;

  const result = await getWhatsappProvider().send({ to: parent.phone, text });

  await supabase.from("messages").insert({
    type: "payment_reminder",
    recipient_profile_id: inv.parent_id,
    recipient_phone: parent.phone,
    body: text,
    invoice_id: inv.id,
    status: result.status === "sent" ? "sent" : "failed",
    provider_message_id: result.providerMessageId ?? null,
    error: result.error ?? null,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
  });

  revalidatePath("/admin/invoices");
}

// WhatsApp click-to-chat: the admin opened wa.me with the reminder; log it.
export async function logReminderSend(formData: FormData) {
  const invoice_id = String(formData.get("invoice_id"));
  const recipient_phone = String(formData.get("recipient_phone") ?? "");
  const recipient_profile_id = (formData.get("recipient_profile_id") as string) || null;
  const body = String(formData.get("body") ?? "");

  const supabase = await createClient();
  await supabase.from("messages").insert({
    type: "payment_reminder",
    recipient_profile_id,
    recipient_phone,
    body,
    invoice_id,
    provider: "wa_click",
    status: "sent",
    sent_at: new Date().toISOString(),
  });
  revalidatePath("/admin/invoices");
}
