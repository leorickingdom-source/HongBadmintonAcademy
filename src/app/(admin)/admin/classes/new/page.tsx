import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ClassForm } from "../class-form";
import { createClass } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewClassPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: coaches } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "coach")
    .order("full_name");

  return (
    <div>
      <PageHeader title="New class" />
      <ClassForm action={createClass} coaches={coaches ?? []} error={error} />
    </div>
  );
}
