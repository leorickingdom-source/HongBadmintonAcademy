import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { RewardForm } from "../reward-form";
import { updateRewardRule } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditRewardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: rule } = await supabase.from("reward_rules").select("*").eq("id", id).maybeSingle();
  if (!rule) notFound();

  return (
    <div>
      <PageHeader title="Edit reward rule" description={rule.name} />
      <RewardForm action={updateRewardRule} rule={rule} error={error} />
    </div>
  );
}
