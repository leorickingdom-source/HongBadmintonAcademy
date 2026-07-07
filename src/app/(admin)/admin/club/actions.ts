"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewBranchId } from "@/lib/branch";
import { getMonthlySchedule } from "@/lib/settings";
import { generateClubDuesCore } from "@/lib/club-billing";
import { clubMemberSchema } from "@/lib/validation";

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// Club members are super-admin managed (club finance). We use the service-role
// client with an explicit requireSuperAdmin() gate — the same manual-scoping
// pattern the parent area uses — so we never depend on RLS for writes.
export async function createClubMember(formData: FormData) {
  const me = await requireSuperAdmin();
  const parsed = clubMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err("/admin/club/new", parsed.error.issues[0].message);
  const db = createAdminClient();
  const { error } = await db.from("club_members").insert({ ...parsed.data, branch_id: await getViewBranchId(me) });
  if (error) err("/admin/club/new", error.message);
  revalidatePath("/admin/club");
  redirect("/admin/club");
}

export async function updateClubMember(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const parsed = clubMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`/admin/club/${id}`, parsed.error.issues[0].message);
  const db = createAdminClient();
  const { error } = await db
    .from("club_members")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) err(`/admin/club/${id}`, error.message);
  revalidatePath("/admin/club");
  redirect("/admin/club");
}

export async function deleteClubMember(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  await createAdminClient().from("club_members").delete().eq("id", id);
  revalidatePath("/admin/club");
}

// Manual "Generate dues now" — raise this month's membership invoice for every
// active member on a monthly tier, instead of waiting for the daily cron. Same
// idempotent core, so clicking twice won't double-bill.
export async function generateClubDuesNow() {
  await requireSuperAdmin();
  const schedule = await getMonthlySchedule();
  const { generated } = await generateClubDuesCore(createAdminClient(), new Date(), schedule.dueDay);
  revalidatePath("/admin/club");
  redirect(`/admin/club?dues=${generated}`);
}

// Cancel a court booking. A still-unpaid linked invoice is canceled too; a paid
// one is left for the super-admin to refund from Invoices (money out).
export async function cancelBooking(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const db = createAdminClient();
  const { data: bk } = await db.from("court_bookings").select("id, invoice_id").eq("id", id).maybeSingle();
  if (!bk) redirect(`/admin/club/bookings?error=${encodeURIComponent("Booking not found.")}`);
  await db.from("court_bookings").update({ status: "canceled" }).eq("id", id);
  if ((bk as any).invoice_id) {
    const { data: inv } = await db.from("invoices").select("status").eq("id", (bk as any).invoice_id).maybeSingle();
    if (inv && ["unpaid", "overdue", "draft"].includes((inv as any).status)) {
      await db.from("invoices").update({ status: "canceled" }).eq("id", (bk as any).invoice_id);
    }
  }
  revalidatePath("/admin/club/bookings");
  redirect("/admin/club/bookings?canceled=1");
}

// Raise this member's membership invoice for the current month (business=club →
// shows up in /admin/pots). Amount + currency come from their tier (a club fee
// plan). Manual button for 2a; a recurring dues cron follows in 2c.
export async function raiseMemberInvoice(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const db = createAdminClient();

  const { data: m } = await db
    .from("club_members")
    .select("id, branch_id, tier:fee_plans!club_members_tier_id_fkey(id, name, amount, currency)")
    .eq("id", id)
    .maybeSingle();
  if (!m) err("/admin/club", "Member not found.");
  const tier = (m as any).tier;
  if (!tier) err("/admin/club", "Assign a membership tier first.");

  const now = new Date();
  const period = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
  const dueDate = new Date(now.getFullYear(), now.getMonth(), 7).toLocaleDateString("en-CA");

  const { error } = await db.from("invoices").insert({
    club_member_id: id,
    fee_plan_id: tier.id,
    amount: tier.amount,
    currency: tier.currency,
    business: "club",
    branch_id: (m as any).branch_id ?? null,
    period_month: period,
    due_date: dueDate,
    description: `Club membership — ${tier.name}`,
    status: "unpaid",
  });
  if (error) err("/admin/club", error.message);
  revalidatePath("/admin/club");
  redirect("/admin/club?raised=1");
}
