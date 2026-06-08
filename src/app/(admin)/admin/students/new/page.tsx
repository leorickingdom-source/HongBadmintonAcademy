import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { StudentForm } from "../student-form";
import { createStudent } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: parents } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "parent")
    .order("full_name");

  return (
    <div>
      <PageHeader title="New student" />
      <StudentForm action={createStudent} parents={parents ?? []} error={error} />
    </div>
  );
}
