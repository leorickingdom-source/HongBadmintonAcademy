import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { FeePlanForm } from "../fee-plan-form";
import { createFeePlan } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewFeePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
  return (
    <div>
      <PageHeader title={L.fpf_new_title} />
      <FeePlanForm action={createFeePlan} error={error} locale={me.locale} />
    </div>
  );
}
