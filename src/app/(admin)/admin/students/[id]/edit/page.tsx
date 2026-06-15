import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { StudentForm } from "../../student-form";
import { updateStudent } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: student }, { data: parents }, { data: plans }] = await Promise.all([
    supabase.from("students").select("*").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("role", "parent").order("full_name"),
    supabase.from("fee_plans").select("id, name, amount, currency, interval").eq("is_active", true).order("name"),
  ]);

  if (!student) notFound();

  return (
    <div>
      <PageHeader title="Edit student" description={student.full_name} />
      <StudentForm
        action={updateStudent}
        student={student}
        parents={parents ?? []}
        plans={plans ?? []}
        error={error}
      />
    </div>
  );
}
