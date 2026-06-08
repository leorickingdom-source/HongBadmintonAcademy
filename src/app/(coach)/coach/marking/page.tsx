import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Table, Th, Td, EmptyState, LinkButton } from "@/components/ui";
import { coachClassIds } from "../_data";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

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
        <Section title={`Students (${students.length})`} flush>
          <Table>
            <thead>
              <tr><Th>Student</Th><Th>Class</Th><Th className="text-right">Action</Th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                        {initials(s.full_name)}
                      </span>
                      <span className="font-medium text-slate-900">{s.full_name}</span>
                    </div>
                  </Td>
                  <Td className="text-slate-500">{s.className ?? "—"}</Td>
                  <Td className="text-right">
                    <LinkButton href={`/coach/marking/${s.id}`} variant="secondary">Mark</LinkButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message="No students assigned to your classes yet." />
      )}
    </div>
  );
}
