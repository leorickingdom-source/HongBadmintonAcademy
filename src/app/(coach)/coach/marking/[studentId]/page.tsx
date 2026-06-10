import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Field, Input, Textarea, Button, LinkButton,
  Table, Th, Td, EmptyState, Badge,
} from "@/components/ui";
import { formatDate, formatDateTime, monthLabel, weekLabel, currentWeekStartMYT } from "@/lib/format";
import { createAssessment, addNote, markWeek } from "../actions";

export const dynamic = "force-dynamic";

function monthBounds() {
  const now = new Date(Date.now() + 8 * 3600 * 1000); // MYT
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: `${y}-${String(m + 1).padStart(2, "0")}-01`, end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) };
}

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

  const { start: mStart, end: mEnd } = monthBounds();
  const [{ data: enrClass }, { data: monthAtt }, { data: existingAssess }] = await Promise.all([
    supabase.from("enrollments").select("classes(name)").eq("student_id", studentId).eq("active", true).limit(1).maybeSingle(),
    supabase.from("attendance").select("status, sessions!inner(session_date)").eq("student_id", studentId).gte("sessions.session_date", mStart).lte("sessions.session_date", mEnd),
    supabase.from("assessments").select("assessed_on").eq("student_id", studentId).gte("assessed_on", mStart).lte("assessed_on", mEnd).order("assessed_on", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const className = (enrClass as any)?.classes?.name ?? null;
  const attTotal = (monthAtt ?? []).length;
  const attHere = (monthAtt ?? []).filter((a: any) => a.status === "present" || a.status === "late").length;

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

  const weekStart = currentWeekStartMYT();
  const [{ data: history }, { data: notes }, { data: thisWeek }, { data: weekHistory }] = await Promise.all([
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
    supabase
      .from("weekly_marks")
      .select("rating, comment, week_start")
      .eq("student_id", studentId)
      .eq("week_start", weekStart)
      .maybeSingle(),
    supabase
      .from("weekly_marks")
      .select("week_start, rating, comment")
      .eq("student_id", studentId)
      .order("week_start", { ascending: false })
      .limit(8),
  ]);
  const weekRating = (thisWeek as any)?.rating as number | undefined;

  return (
    <div className="space-y-6">
      <LinkButton href="/coach/marking" variant="ghost" className="!px-0">← Back to students</LinkButton>

      <PageHeader title={student.full_name} description={`Skills assessment · ${className ?? "—"} · ${monthLabel(mStart)}`} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <span className="font-medium text-slate-800">{monthLabel(mStart)} assessment</span>
        <span className="text-slate-500">Attendance this month: {attTotal ? `${attHere}/${attTotal}` : "no sessions yet"}</span>
        {existingAssess ? (
          <span className="text-amber-600">⚠ already assessed {formatDate(existingAssess.assessed_on)} — saving adds another</span>
        ) : (
          <span className="text-slate-400">not yet assessed this month</span>
        )}
      </div>

      {saved && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {saved === "week" ? "Weekly mark saved." : "Assessment saved."}
        </p>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* This week — quick 1–5 check-in (separate from the monthly assessment) */}
      <Section title="This week" description={`Quick progress mark · ${weekLabel(weekStart)}`}>
        <form action={markWeek} className="space-y-3">
          <input type="hidden" name="student_id" value={student.id} />
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="submit"
                name="rating"
                value={n}
                className={
                  "flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset transition-colors " +
                  (weekRating === n
                    ? "bg-green-600 text-white ring-transparent"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")
                }
              >
                {n}
              </button>
            ))}
            <span className="ml-2 text-xs text-slate-500">
              {weekRating ? `Marked ${weekRating}/5 this week — tap to change` : "1 = needs work · 5 = excellent"}
            </span>
          </div>
          <Input name="comment" placeholder="Optional note for this week…" defaultValue={(thisWeek as any)?.comment ?? ""} />
        </form>
      </Section>

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

      {/* Weekly marks history */}
      <Section title="Weekly marks" flush>
        {weekHistory && weekHistory.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Week</Th><Th>Rating</Th><Th>Note</Th></tr>
            </thead>
            <tbody>
              {(weekHistory as any[]).map((w) => (
                <tr key={w.week_start} className="hover:bg-slate-50">
                  <Td>{weekLabel(w.week_start)}</Td>
                  <Td><Badge tone={w.rating >= 4 ? "green" : w.rating >= 3 ? "blue" : "yellow"}>{w.rating}/5</Badge></Td>
                  <Td className="max-w-sm truncate text-slate-500" title={w.comment ?? ""}>{w.comment ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No weekly marks yet." /></div>
        )}
      </Section>
    </div>
  );
}
