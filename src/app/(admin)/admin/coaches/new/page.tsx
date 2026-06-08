import { PageHeader } from "@/components/ui";
import { PersonForm } from "../../_people/person-form";
import { createPerson } from "../../_people/actions";

export default async function NewCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <PageHeader title="New coach" />
      <PersonForm role="coach" action={createPerson.bind(null, "coach")} error={error} />
    </div>
  );
}
