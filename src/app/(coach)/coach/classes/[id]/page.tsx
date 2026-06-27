import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, Avatar, Badge, LinkButton, EmptyState, cn } from "@/components/ui";
import { coachClassIds } from "../../_data";
import { levelBadgeClass, levelName, levelNameBadgeClass } from "@/lib/training";

export const dynamic = "force-dynamic";

function monthBounds() {
  const now = new Date(Date.now() + 8 * 3600 * 1000); // MYT
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: `${y}-${String(m + 1).padStart(2, "0")}-01`, end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) };
}

// Coach class detail — roster + this-month attendance + level at a glance,
// each student linking into their marking page. Mirrors the parent child-detail
// pattern. A coach can only open their own classes.
export default async function CoachClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("coach");
  const { id } = await params;
  const supabase = await createClient();

  const classIds = await coachClassIds(supabase, me.id);
  if (!classIds.includes(id)) notFound();

  const { data: cls } = await supabase
    .from("classes")
    .select("id, name, level, capacity")
    .eq("id", id)
    .maybeSingle();
  if (!cls) notFound();

  const { start, end } = monthBounds();

  const [{ data: enr }, { data: monthSess }] = await Promise.all([
    supabase.from("enrollments").select("students(id, full_name, photo_url, level)").eq("class_id", id).eq("active", true),
    supabase.from("sessions").select("id").eq("class_id", id).gte("session_date", start).lte("session_date", end),
  ]);

  const roster = (enr ?? []).map((e: any) => e.students).filter(Boolean);
  const studentIds = roster.map((s: any) => s.id);
  const monthSessIds = (monthSess ?? []).map((s: any) => s.id);

  const attByStudent = new Map<string, { came: number; total: number }>();
  if (monthSessIds.length && studentIds.length) {
    const { data: att } = await supabase
      .from("attendance")
      .select("student_id, status")
      .in("session_id", monthSessIds)
      .in("student_id", studentIds);
    for (const a of (att ?? []) as any[]) {
      const e = attByStudent.get(a.student_id) ?? { came: 0, total: 0 };
      e.total += 1;
      if (a.status === "present" || a.status === "late") e.came += 1;
      attByStudent.set(a.student_id, e);
    }
  }

  let came = 0;
  let total = 0;
  for (const v of attByStudent.values()) {
    came += v.came;
    total += v.total;
  }
  const attPct = total ? Math.round((came / total) * 100) : null;

  const sorted = [...roster].sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="space-y-6">
      <LinkButton href="/coach" variant="ghost" className="!px-0">← Back</LinkButton>
      <PageHeader
        title={cls.name ?? "Class"}
        description={cls.level ? <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", levelNameBadgeClass(cls.level))}>{cls.level} class</span> : undefined}
      />

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Students" value={`${sorted.length}${cls.capacity ? ` / ${cls.capacity}` : ""}`} />
        <StatCard label="Attendance" value={attPct != null ? `${attPct}%` : "—"} tone={attPct != null && attPct >= 70 ? "green" : "amber"} sub="this month" />
      </div>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/coach/checkin">Check-in</LinkButton>
        <LinkButton href="/coach/schedule" variant="secondary">Schedule</LinkButton>
      </div>

      <Section title={`Roster (${sorted.length})`} flush>
        {sorted.length ? (
          <ul className="divide-y divide-slate-100">
            {sorted.map((s: any) => {
              const lvl = Number(s.level ?? 1);
              const a = attByStudent.get(s.id);
              return (
                <li key={s.id}>
                  <Link href={`/coach/exams/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <Avatar name={s.full_name} src={s.photo_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">{s.full_name}</div>
                      <div className="text-xs text-slate-500">{a ? `${a.came}/${a.total} attended this month` : "no sessions yet"}</div>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", levelBadgeClass(lvl))}>L{lvl} · {levelName(lvl)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message="No students enrolled in this class." /></div>
        )}
      </Section>
    </div>
  );
}
