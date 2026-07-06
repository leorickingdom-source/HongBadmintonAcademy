import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listBranches } from "@/lib/branch";
import { PageHeader } from "@/components/ui";
import { PersonForm } from "../../../_people/person-form";
import { updateStaff } from "../../../_people/actions";

export const dynamic = "force-dynamic";

export default async function EditStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: person }, branches] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    listBranches(),
  ]);
  if (!person || (person.role !== "admin" && person.role !== "super_admin" && person.role !== "coach")) notFound();

  return (
    <div>
      <PageHeader title="Edit staff" description={person.full_name ?? person.email ?? undefined} />
      <PersonForm
        role={person.role}
        person={person}
        action={updateStaff}
        roleOptions={[
          { value: "admin", label: "Branch admin (one branch)" },
          { value: "super_admin", label: "Super admin (all branches)" },
          { value: "coach", label: "Coach" },
        ]}
        branches={branches}
        showBranch
        allowEmailEdit
        cancelHref="/admin/staff"
        submitLabel="Save changes"
        error={error}
      />
    </div>
  );
}
