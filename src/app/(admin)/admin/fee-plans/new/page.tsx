import { PageHeader } from "@/components/ui";
import { FeePlanForm } from "../fee-plan-form";
import { createFeePlan } from "../actions";

export default async function NewFeePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <PageHeader title="New fee plan" />
      <FeePlanForm action={createFeePlan} error={error} />
    </div>
  );
}
