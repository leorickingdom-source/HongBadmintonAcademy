import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { PersonForm } from "../../_people/person-form";
import { createPerson } from "../../_people/actions";

export const dynamic = "force-dynamic";

export default async function NewParentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
  return (
    <div>
      <PageHeader title={L.pf_new_parent} />
      <PersonForm role="parent" action={createPerson.bind(null, "parent")} error={error} locale={me.locale} />
    </div>
  );
}
