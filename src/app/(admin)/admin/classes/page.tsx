import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteClass } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("*, coach:profiles!classes_coach_id_fkey(full_name), enrollments(count)")
    .order("name");

  return (
    <div>
      <PageHeader
        title="Classes & Schedule"
        description="Training classes, weekly schedules, coaches and enrolment."
        action={<LinkButton href="/admin/classes/new">+ New class</LinkButton>}
      />

      {classes && classes.length > 0 ? (
        <Section title={`Classes (${classes.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Level</Th>
                <Th>Primary coach</Th>
                <Th>Students</Th>
                <Th>Active</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td>{c.level ? <Badge tone="blue">{c.level}</Badge> : "—"}</Td>
                  <Td className="text-slate-500">{c.coach?.full_name ?? "—"}</Td>
                  <Td className="tabular-nums">{c.enrollments?.[0]?.count ?? 0}</Td>
                  <Td>
                    <Badge tone={c.is_active ? "green" : "slate"}>
                      {c.is_active ? "active" : "inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`/admin/classes/${c.id}`} variant="secondary">
                        Manage
                      </LinkButton>
                      <form action={deleteClass}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton confirmText={`Delete class "${c.name}"?`} />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message="No classes yet." />
      )}
    </div>
  );
}
