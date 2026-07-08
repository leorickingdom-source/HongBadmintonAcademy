import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { RewardForm } from "../reward-form";
import { createRewardRule } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRewardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
  return (
    <div>
      <PageHeader title={L.rwf_new_title} />
      <RewardForm action={createRewardRule} error={error} locale={me.locale} />
    </div>
  );
}
