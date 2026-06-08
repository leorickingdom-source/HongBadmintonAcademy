import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Field, Input, Textarea, Button, LinkButton,
  Table, Th, Td, EmptyState, Badge,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { createAssessment, addNote } from "../actions";

export const dynamic = "force-dynamic";

export default async function MarkStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireRole("coach");
  const { studentId } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) notFound();

  const { data: scheme } = await supabase
    .from("marking_schemes")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: criteria } = scheme
    ? await supabase.from("marking_criteria").select("*").eq("scheme_id", scheme.id).order("sort_order")
    : { data: [] as any[] };

  const [{ data: history }, { data: notes }] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, assessed_on, overall_score, comment, marking_schemes(name)")
      .eq("student_id", studentId)
      .order("assessed_on", { ascending: false })
      .limit(20),
    supabase
      .from("session_notes")
      .select("id, note, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <LinkButton href="/coach/marking" variant="ghost" className="!px-0">← Back to students</LinkButton>

      <PageHeader title={student.full_name} description="Record a skills assessment and session notes." />

      {saved && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">Assessment saved.</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* New assessment */}
        <div className="lg:col-span-2">
          <Section title="New assessment" description={scheme ? `Scheme: ${scheme.name}` : undefined}>
            {scheme ? (
              <form action={createAssessment} className="space-y-4">
                <input type="hidden" name="student_id" value={student.id} />
                <input type="hidden" name="scheme_id" value={scheme.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {(criteria ?? []).map((c: any) => (
                    <Field key={c.id} label={`${c.name}`} hint={`max ${Number(c.max_score)} · weight ${Number(c.weight)}`}>
                      <Input
                        type="number"
                        name={`score_${c.id}`}
                        min="0"
                        max={c.max_score}
                        step="0.1"
                        defaultValue={0}
                        required
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Comment">
                  <Textarea name="comment" placeholder="Coach feedback for this assessment…" />
                </Field>
                <Button type="submit">Save assessment</Button>
              </form>
            ) : (
              <EmptyState message="No active marking scheme. Ask an admin to set one up." />
            )}
          </Section>
        </div>

        {/* Notes */}
        <div>
          <Section title="Session notes">
            <form action={addNote} className="mb-4 flex gap-2">
              <input type="hidden" name="student_id" value={student.id} />
              <Input name="note" placeholder="Add a quick note…" className="flex-1" required />
              <Button type="submit">Add</Button>
            </form>
            <ul className="space-y-2">
              {(notes ?? []).map((n: any) => (
                <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="text-slate-700">{n.note}</div>
                  <div className="mt-1 text-xs text-slate-400">{formatDateTime(n.created_at)}</div>
                </li>
              ))}
              {(notes ?? []).length === 0 && <li className="text-sm text-slate-400">No notes yet.</li>}
            </ul>
          </Section>
        </div>
      </div>

      {/* History */}
      <Section title="Assessment history" flush>
        {history && history.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Scheme</Th><Th>Overall</Th><Th>Comment</Th></tr>
            </thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <Td>{formatDate(h.assessed_on)}</Td>
                  <Td className="text-slate-500">{h.marking_schemes?.name ?? "—"}</Td>
                  <Td><Badge tone="blue">{h.overall_score != null ? `${h.overall_score}%` : "—"}</Badge></Td>
                  <Td className="max-w-sm truncate text-slate-500" title={h.comment ?? ""}>{h.comment ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No assessments recorded yet." /></div>
        )}
      </Section>
    </div>
  );
}
