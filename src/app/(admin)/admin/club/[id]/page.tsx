import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { ClubMemberForm } from "../club-member-form";
import { updateClubMember } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditClubMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireSuperAdmin();
  const L = dict(me.locale);
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: member }, { data: tiers }] = await Promise.all([
    supabase.from("club_members").select("id, full_name, email, phone, tier_id, status, notes").eq("id", id).maybeSingle(),
    supabase.from("fee_plans").select("id, name, amount, currency").eq("business", "club").eq("is_active", true).order("name"),
  ]);
  if (!member) notFound();

  return (
    <div>
      <PageHeader title={L.cmf_edit_title} description={member.full_name} />
      <ClubMemberForm action={updateClubMember} member={member as any} tiers={tiers ?? []} error={error} locale={me.locale} />
    </div>
  );
}
