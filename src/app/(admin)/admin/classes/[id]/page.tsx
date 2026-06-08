import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Field, Input, Select, Button,
  Table, Th, Td, EmptyState, LinkButton,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { dayName, formatTime, DAY_NAMES } from "@/lib/format";
import { ClassForm } from "../class-form";
import {
  updateClass, addSchedule, deleteSchedule, addCoach, removeCoach,
  enrollStudent, unenrollStudent, generateSessions,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ManageClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [
    { data: classRow },
    { data: coaches },
    { data: schedules },
    { data: assigned },
    { data: enrollments },
    { data: students },
    { count: sessionCount },
  ] = await Promise.all([
    supabase.from("classes").select("*").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
    supabase.from("class_schedules").select("*").eq("class_id", id).order("day_of_week"),
    supabase.from("class_coaches").select("coach_id, profiles(full_name)").eq("class_id", id),
    supabase.from("enrollments").select("id, student_id, students(full_name)").eq("class_id", id),
    supabase.from("students").select("id, full_name").eq("status", "active").order("full_name"),
    supabase.from("sessions").select("*", { count: "exact", head: true }).eq("class_id", id),
  ]);

  if (!classRow) notFound();

  const assignedIds = new Set((assigned ?? []).map((a: any) => a.coach_id));
  const enrolledIds = new Set((enrollments ?? []).map((e: any) => e.student_id));
  const availableCoaches = (coaches ?? []).filter((c) => !assignedIds.has(c.id));
  const availableStudents = (students ?? []).filter((s) => !enrolledIds.has(s.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage class"
        description={classRow.name}
        action={<LinkButton href="/admin/classes" variant="ghost">← All classes</LinkButton>}
      />
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <ClassForm action={updateClass} classRow={classRow} coaches={coaches ?? []} />

      {/* Schedule */}
      <Section title="Weekly schedule" flush>
        {schedules && schedules.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Day</Th><Th>Time</Th><Th>Location</Th><Th>Grace</Th><Th className="text-right">—</Th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{dayName(s.day_of_week)}</Td>
                  <Td>{formatTime(s.start_time)}–{formatTime(s.end_time)}</Td>
                  <Td className="text-slate-500">{s.location ?? "—"}</Td>
                  <Td className="text-slate-500">{s.grace_minutes} min</Td>
                  <Td className="text-right">
                    <form action={deleteSchedule}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="class_id" value={classRow.id} />
                      <ConfirmButton label="Remove" confirmText="Remove this schedule?" />
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="px-5 pt-5"><EmptyState message="No schedule slots yet." /></div>
        )}
        <form action={addSchedule} className="grid items-end gap-4 border-t border-slate-100 p-5 sm:grid-cols-5">
          <input type="hidden" name="class_id" value={classRow.id} />
          <Field label="Day">
            <Select name="day_of_week" defaultValue="1">
              {DAY_NAMES.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field label="Start"><Input type="time" name="start_time" defaultValue="18:00" required /></Field>
          <Field label="End"><Input type="time" name="end_time" defaultValue="19:30" required /></Field>
          <Field label="Grace (min)"><Input type="number" name="grace_minutes" defaultValue={15} /></Field>
          <Button type="submit">Add slot</Button>
        </form>
      </Section>

      {/* Coaches */}
      <Section title="Coaches">
        <div className="flex flex-wrap gap-2">
          {(assigned ?? []).map((a: any) => (
            <form key={a.coach_id} action={removeCoach}>
              <input type="hidden" name="class_id" value={classRow.id} />
              <input type="hidden" name="coach_id" value={a.coach_id} />
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {a.profiles?.full_name ?? a.coach_id}
                <button className="text-red-500 hover:text-red-700" title="Remove">✕</button>
              </span>
            </form>
          ))}
          {(assigned ?? []).length === 0 && (
            <span className="text-sm text-slate-400">No coaches assigned.</span>
          )}
        </div>
        <form action={addCoach} className="mt-4 flex max-w-md items-end gap-3 border-t border-slate-100 pt-4">
          <input type="hidden" name="class_id" value={classRow.id} />
          <div className="flex-1">
            <Field label="Add coach">
              <Select name="coach_id" defaultValue="">
                <option value="">— select —</option>
                {availableCoaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name ?? c.id}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit">Add</Button>
        </form>
      </Section>

      {/* Enrollment */}
      <Section title="Enrolled students" flush>
        {enrollments && enrollments.length > 0 ? (
          <Table>
            <thead><tr><Th>Student</Th><Th className="text-right">—</Th></tr></thead>
            <tbody>
              {enrollments.map((e: any) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{e.students?.full_name ?? e.student_id}</Td>
                  <Td className="text-right">
                    <form action={unenrollStudent}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="class_id" value={classRow.id} />
                      <ConfirmButton label="Unenroll" confirmText="Remove student from class?" />
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="px-5 pt-5"><EmptyState message="No students enrolled." /></div>
        )}
        <form action={enrollStudent} className="flex max-w-md items-end gap-3 border-t border-slate-100 p-5">
          <input type="hidden" name="class_id" value={classRow.id} />
          <div className="flex-1">
            <Field label="Enroll student">
              <Select name="student_id" defaultValue="">
                <option value="">— select —</option>
                {availableStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit">Enroll</Button>
        </form>
      </Section>

      {/* Sessions */}
      <Section title="Sessions">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <span className="text-2xl font-bold text-slate-900">{sessionCount ?? 0}</span> session(s) scheduled.
          </div>
          <form action={generateSessions}>
            <input type="hidden" name="class_id" value={classRow.id} />
            <Button type="submit" variant="secondary">Generate next 4 weeks</Button>
          </form>
        </div>
      </Section>
    </div>
  );
}
