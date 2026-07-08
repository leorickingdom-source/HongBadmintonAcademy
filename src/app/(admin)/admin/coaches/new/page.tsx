import { requireSuperAdmin } from "@/lib/auth";
import { listBranches } from "@/lib/branch";
import { PageHeader } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { PersonForm } from "../../_people/person-form";
import { createPerson } from "../../_people/actions";

export const dynamic = "force-dynamic";

export default async function NewCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await requireSuperAdmin();
  const L = dict(me.locale);
  const branches = await listBranches();
  return (
    <div>
      <PageHeader title={L.pf_new_coach} />
      <PersonForm role="coach" action={createPerson.bind(null, "coach")} branches={branches} showBranch error={error} locale={me.locale} />
    </div>
  );
}
