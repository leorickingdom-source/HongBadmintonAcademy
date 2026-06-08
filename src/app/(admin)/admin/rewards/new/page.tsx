import { PageHeader } from "@/components/ui";
import { RewardForm } from "../reward-form";
import { createRewardRule } from "../actions";

export default async function NewRewardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <PageHeader title="New reward rule" />
      <RewardForm action={createRewardRule} error={error} />
    </div>
  );
}
