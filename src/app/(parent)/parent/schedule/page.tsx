import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, EmptyState, Badge, Table, Th, Td } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { MY_PUBLIC_HOLIDAYS } from "@/lib/holidays";

export const dynamic = "force-dynamic";

export default async function ParentSchedulePage() {
  const me = await requireRole("parent");
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA");

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("parent_id", me.id)
    .order("full_name");

  const childIds = (children ?? []).map((c) => c.id);

  if (!childIds.length) {
    return (
      <div>
        <PageHeader title="Schedule" description="Upcoming sessions for your children." />
        <EmptyState message="No children linked to your account." />
      </div>
    );
  }

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id, class_id, classes(name)")
    .in("student_id", childIds)
    .eq("active", true);

  const classIds = [...new Set(
    (enrollments ?? []).map((e: any) => e.class_id).filter(Boolean),
  )];

  const { data: sessions } = classIds.length
    ? await supabase
        .from("sessions")
        .select("id, session_date, start_time, end_time, location, status, class_id")
        .in("class_id", classIds)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
        .limit(30)
    : { data: [] as any[] };

  // class_id → child names
  const classToChildren = new Map<string, string[]>();
  for (const e of (enrollments ?? []) as any[]) {
    if (!e.class_id) continue;
    const existing = classToChildren.get(e.class_id) ?? [];
    const child = (children ?? []).find((c) => c.id === e.student_id);
    if (child) existing.push(child.full_name);
    classToChildren.set(e.class_id, existing);
  }

  // class_id → class name
  const classNames = new Map<string, string>();
  for (const e of (enrollments ?? []) as any[]) {
    if (e.class_id && e.classes?.name) classNames.set(e.class_id, e.classes.name);
  }

  // Group sessions under one date heading so the same date isn't repeated row
  // after row — parents scan by day, not by class.
  const byDate = new Map<string, any[]>();
  for (const s of (sessions ?? []) as any[]) {
    const list = byDate.get(s.session_date) ?? [];
    list.push(s);
    byDate.set(s.session_date, list);
  }
  const dates = [...byDate.keys()];

  // Upcoming holidays (no class) — public + the academy's school holidays.
  const [{ data: schoolHols }, { data: dbPub }] = await Promise.all([
    supabase.from("school_holidays").select("name, start_date, end_date").gte("end_date", today).order("start_date").limit(20),
    supabase.from("public_holidays").select("holiday_date, name").gte("holiday_date", today).order("holiday_date").limit(50),
  ]);
  // Public holidays = built-in merged with imported (imported wins on a date).
  const pubByDate = new Map<string, string>();
  for (const h of MY_PUBLIC_HOLIDAYS) if (h.date >= today) pubByDate.set(h.date, h.name);
  for (const r of (dbPub ?? []) as any[]) pubByDate.set(r.holiday_date, r.name);
  const upcomingHols = [
    ...[...pubByDate].map(([date, name]) => ({ name, start: date, end: date, kind: "Public" })),
    ...(schoolHols ?? []).map((h: any) => ({ name: h.name, start: h.start_date, end: h.end_date, kind: "School" })),
  ]
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader title="Schedule" description="Upcoming sessions for your children." />

      {upcomingHols.length > 0 && (
        <Section title="Holidays — no class" flush>
          <ul className="divide-y divide-slate-100">
            {upcomingHols.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="font-medium text-slate-900">{h.name}</div>
                  <div className="text-sm text-slate-500">
                    {h.start === h.end ? formatDate(h.start) : `${formatDate(h.start)} – ${formatDate(h.end)}`}
                  </div>
                </div>
                <Badge tone={h.kind === "School" ? "yellow" : "slate"}>{h.kind}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {dates.length ? (
        <Section title="Upcoming sessions" flush>
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Time</Th><Th>Class</Th><Th>Who</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {(sessions ?? []).map((s: any) => {
                const names = classToChildren.get(s.class_id) ?? [];
                const clsName = classNames.get(s.class_id) ?? "—";
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td label="Date" className="font-medium text-slate-900">{formatDate(s.session_date)}</Td>
                    <Td label="Time">{formatTime(s.start_time)}–{formatTime(s.end_time)}{s.location ? ` · ${s.location}` : ""}</Td>
                    <Td label="Class" className="text-slate-700">{clsName}</Td>
                    <Td label="Who" className="text-slate-500">{names.join(", ") || "—"}</Td>
                    <Td label="Status">
                      <Badge tone={s.status === "completed" ? "green" : s.status === "canceled" ? "red" : "blue"}>
                        {s.status}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message="No upcoming sessions scheduled." />
      )}
    </div>
  );
}
