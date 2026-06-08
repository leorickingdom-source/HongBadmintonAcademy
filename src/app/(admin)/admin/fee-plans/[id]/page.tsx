import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FeePlanForm } from "../fee-plan-form";
import { updateFeePlan } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditFeePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: plan } = await supabase.from("fee_plans").select("*").eq("id", id).maybeSingle();
  if (!plan) notFound();

  return (
    <div>
      <PageHeader title="Edit fee plan" description={plan.name} />
      <FeePlanForm action={updateFeePlan} plan={plan} error={error} />
    </div>
  );
}
