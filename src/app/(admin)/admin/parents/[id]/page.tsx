import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { PersonForm } from "../../_people/person-form";
import { updatePerson } from "../../_people/actions";

export const dynamic = "force-dynamic";

export default async function EditParentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!person) notFound();

  return (
    <div>
      <PageHeader title="Edit parent" description={person.full_name ?? undefined} />
      <PersonForm
        role="parent"
        person={person}
        action={updatePerson.bind(null, "parent")}
        error={error}
      />
    </div>
  );
}
