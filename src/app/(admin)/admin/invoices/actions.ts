"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invoiceSchema } from "@/lib/validation";
import { generateInvoicesCore } from "@/lib/billing";

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

// Manual "Generate this month" button: raise the current month's fee invoices
// for all students on a monthly plan now, instead of waiting for the cron. Same
// idempotent core, so clicking twice won't double-bill.
export async function generateMonthlyInvoices() {
  await generateInvoicesCore(createAdminClient());
  revalidatePath("/admin/invoices");
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
