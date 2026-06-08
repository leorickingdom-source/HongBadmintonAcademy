import { PageHeader } from "@/components/ui";
import { PersonForm } from "../../_people/person-form";
import { createPerson } from "../../_people/actions";

export default async function NewParentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <PageHeader title="New parent" />
      <PersonForm role="parent" action={createPerson.bind(null, "parent")} error={error} />
    </div>
  );
}
