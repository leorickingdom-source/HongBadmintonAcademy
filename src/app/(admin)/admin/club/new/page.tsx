import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { ClubMemberForm } from "../club-member-form";
import { createClubMember } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewClubMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireSuperAdmin();
  const L = dict(me.locale);
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: tiers } = await supabase
    .from("fee_plans")
    .select("id, name, amount, currency")
    .eq("business", "club")
    .eq("is_active", true)
    .order("name");

  return (
    <div>
      <PageHeader title={L.cmf_new_title} description={L.cmf_new_desc} />
      <ClubMemberForm action={createClubMember} tiers={tiers ?? []} error={error} locale={me.locale} />
    </div>
  );
}
