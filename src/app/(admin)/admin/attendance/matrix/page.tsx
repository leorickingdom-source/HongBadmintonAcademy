import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, EmptyState, cn } from "@/components/ui";
import { studentRank, rankBadgeClass } from "@/lib/ranks";

export const dynamic = "force-dynamic";

const DOT: Record<string, string> = {
  present: "bg-green-500", late: "bg-amber-500", absent: "bg-red-500", excused: "bg-slate-400",
};

function shortDate(d: string) {
  const dt = new Date(d);
  return {
    day: dt.toLocaleDateString("en-MY", { day: "2-digit", timeZone: "UTC" }),
    mon: dt.toLocaleDateString("en-MY", { month: "short", timeZone: "UTC" }).toUpperCase(),
  };
}

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: qClass } = await searchParams;
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("is_active", true)
    .order("name");
  const classId = qClass ?? classes?.[0]?.id ?? null;

  let sessions: { id: string; session_date: string }[] = [];
  let rows: { student: any; rank: string | null; cells: (string | null)[]; attended: number; pct: number; streak: number }[] = [];

  if (classId) {
    const [{ data: enr }, { data: sess }] = await Promise.all([
      supabase.from("enrollments").select("students(id, full_name, rank)").eq("class_id", classId).eq("active", true),
      supabase.from("sessions").select("id, session_date").eq("class_id", classId).order("session_date", { ascending: false }).limit(16),
    ]);
    const students = (enr ?? [])
      .map((e: any) => e.students)
      .filter(Boolean)
      .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
    sessions = (sess ?? []).slice().reverse(); // oldest → newest

    // Class rank per student (highest tier across their enrolled classes).
    const studentIds = students.map((s: any) => s.id);
    const { data: enrAll } = studentIds.length
      ? await supabase.from("enrollments").select("student_id, classes(level)").eq("active", true).in("student_id", studentIds)
      : { data: [] as any[] };
    const levelsByStudent = new Map<string, (string | null)[]>();
    for (const e of (enrAll ?? []) as any[]) {
      const arr = levelsByStudent.get(e.student_id) ?? [];
      arr.push(e.classes?.level ?? null);
      levelsByStudent.set(e.student_id, arr);
    }
    const rankOf = (st: any) => studentRank(st.rank, levelsByStudent.get(st.id) ?? []);

    const attMap = new Map<string, string>();
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length && students.length) {
      const { data: att } = await supabase
        .from("attendance")
        .select("session_id, student_id, status")
        .in("session_id", sessionIds);
      for (const a of att ?? []) attMap.set(`${a.session_id}:${a.student_id}`, a.status);
    }

    rows = students.map((st: any) => {
      const cells = sessions.map((s) => attMap.get(`${s.id}:${st.id}`) ?? null);
      const marked = cells.filter((c) => c != null).length;
      const attended = cells.filter((c) => c === "present" || c === "late").length;
      const pct = marked ? Math.round((attended / marked) * 100) : 0;
      let streak = 0;
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i] === "present" || cells[i] === "late") streak++;
        else if (cells[i] === null) continue; // skip unmarked
        else break;
      }
      return { student: st, rank: rankOf(st), cells, attended, pct, streak };
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance grid"
        description="Last 16 lessons, oldest → newest. Hover a dot for status."
        action={<LinkButton href="/admin" variant="ghost">← Dashboard</LinkButton>}
      />

      {classes && classes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {classes.map((c: any) => (
            <LinkButton
              key={c.id}
              href={`/admin/attendance/matrix?class=${c.id}`}
              variant={c.id === classId ? "primary" : "secondary"}
              className="!px-3 !py-1.5 text-xs"
            >
              {c.name}
              {c.level && (
                <span className={cn("ml-1.5 inline-flex rounded px-1 py-px text-[9px] font-bold uppercase", rankBadgeClass(c.level))}>{c.level}</span>
              )}
            </LinkButton>
          ))}
        </div>
      )}

      {rows.length === 0 || sessions.length === 0 ? (
        <EmptyState message="No students or sessions for this class yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Student
                </th>
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">Rank</th>
                {sessions.map((s) => {
                  const d = shortDate(s.session_date);
                  return (
                    <th key={s.id} className="border-b border-slate-200 px-1.5 py-2 text-center text-[10px] font-medium leading-tight text-slate-400">
                      <div>{d.day}</div>
                      <div>{d.mon}</div>
                    </th>
                  );
                })}
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">Came</th>
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">Rate</th>
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">Streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2 font-medium text-slate-900">
                    {r.student.full_name}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-center">
                    {r.rank ? (
                      <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold", rankBadgeClass(r.rank))}>{r.rank}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="border-b border-slate-100 px-1.5 py-2 text-center">
                      <span
                        title={c ?? "no record"}
                        className={cn("inline-block h-3 w-3 rounded-full", c ? DOT[c] : "bg-slate-100 ring-1 ring-inset ring-slate-200")}
                      />
                    </td>
                  ))}
                  <td className="border-b border-slate-100 px-2 py-2 text-center font-medium text-slate-700">{r.attended}</td>
                  <td className={cn("border-b border-slate-100 px-2 py-2 text-center font-semibold", r.pct >= 80 ? "text-green-600" : r.pct >= 50 ? "text-amber-600" : "text-red-600")}>
                    {r.pct}%
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-center font-semibold text-green-700">{r.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
