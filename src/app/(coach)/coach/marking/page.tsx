import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Th, Td, EmptyState, LinkButton } from "@/components/ui";
import { coachClassIds } from "../_data";

export const dynamic = "force-dynamic";

export default async function MarkingListPage() {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);

  let students: any[] = [];
  if (classIds.length) {
    const { data } = await supabase
      .from("enrollments")
      .select("student_id, students(id, full_name), classes(name)")
      .in("class_id", classIds)
      .eq("active", true);
    // de-dup students across classes
    const seen = new Map<string, any>();
    for (const e of data ?? []) {
      const s = (e as any).students;
      if (s && !seen.has(s.id)) seen.set(s.id, { ...s, className: (e as any).classes?.name });
    }
    students = [...seen.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  return (
    <div>
      <PageHeader title="Marking" description="Select a student to record skills and notes." />

      {students.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Student</Th><Th>Class</Th><Th className="text-right">—</Th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium text-slate-900">{s.full_name}</Td>
                <Td>{s.className ?? "—"}</Td>
                <Td className="text-right">
                  <LinkButton href={`/coach/marking/${s.id}`} variant="secondary">Mark</LinkButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState message="No students assigned to your classes yet." />
      )}
    </div>
  );
}
