import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PageHeader, LinkButton, EmptyState, cn } from "@/components/ui";
import { FilterSelect } from "@/components/filter-controls";
import { levelBadgeClass } from "@/lib/training";
import { dict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const DOT: Record<string, string> = {
  present: "bg-green-500", late: "bg-amber-500", absent: "bg-red-500", excused: "bg-slate-400",
};
const LETTER: Record<string, string> = { present: "P", late: "L", absent: "A", excused: "E" };

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
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const supabase = await createClient();
  const LEGEND: [string, string, string][] = [
    [L.att_present, "P", "bg-green-500"], [L.att_late, "L", "bg-amber-500"],
    [L.att_absent, "A", "bg-red-500"], [L.att_excused, "E", "bg-slate-400"],
  ];

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level")
    .eq("is_active", true)
    .order("name");
  const classId = qClass ?? classes?.[0]?.id ?? null;

  let sessions: { id: string; session_date: string }[] = [];
  let rows: { student: any; level: number; cells: (string | null)[]; attended: number; pct: number; streak: number }[] = [];

  if (classId) {
    const [{ data: enr }, { data: sess }] = await Promise.all([
      supabase.from("enrollments").select("students(id, full_name, level)").eq("class_id", classId).eq("active", true),
      supabase.from("sessions").select("id, session_date").eq("class_id", classId).order("session_date", { ascending: false }).limit(16),
    ]);
    const students = (enr ?? [])
      .map((e: any) => e.students)
      .filter(Boolean)
      .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
    sessions = (sess ?? []).slice().reverse(); // oldest → newest

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
      return { student: st, level: Number(st.level ?? 1), cells, attended, pct, streak };
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={L.mx_title}
        description={L.mx_desc}
        action={<LinkButton href="/admin" variant="ghost">← {L.dashboard}</LinkButton>}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        {LEGEND.map(([label, letter, bg]) => (
          <span key={letter} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white", bg)}>{letter}</span>
            {label}
          </span>
        ))}
      </div>

      {classes && classes.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
          {L.class_word}
          <FilterSelect name="class" defaultValue={classId ?? ""} className="h-9 w-56">
            {classes.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}{c.level ? ` · ${c.level}` : ""}</option>
            ))}
          </FilterSelect>
        </label>
      )}

      {rows.length === 0 || sessions.length === 0 ? (
        <EmptyState message={L.mx_empty} />
      ) : (
        <>
        {/* Mobile: per-student cards (the wide dot grid is unusable on a phone). */}
        <div className="space-y-2 md:hidden">
          {rows.map((r) => (
            <div key={r.student.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/admin/students/${r.student.id}`} className="truncate font-medium text-slate-900 hover:text-green-700 hover:underline">{r.student.full_name}</Link>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", r.pct >= 80 ? "text-green-600" : r.pct >= 50 ? "text-amber-600" : "text-red-600")}>{r.pct}%</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className={cn("inline-flex rounded-full px-1.5 py-0.5 font-semibold", levelBadgeClass(r.level))}>L{r.level}</span>
                <span>{r.attended} {L.mx_attended_word}</span>
                <span className="font-medium text-green-700">🔥 {r.streak}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.cells.slice(-10).map((c, i) => (
                  <span key={i} aria-label={c ?? L.mx_no_record} className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white", c ? DOT[c] : "bg-slate-100 text-transparent ring-1 ring-inset ring-slate-200")}>{c ? LETTER[c] : ""}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {L.student_col}
                </th>
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">{L.level_word}</th>
                {sessions.map((s) => {
                  const d = shortDate(s.session_date);
                  return (
                    <th key={s.id} className="border-b border-slate-200 px-1.5 py-2 text-center text-[10px] font-medium leading-tight text-slate-400">
                      <div>{d.day}</div>
                      <div>{d.mon}</div>
                    </th>
                  );
                })}
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">{L.mx_attended}</th>
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">{L.mx_rate}</th>
                <th className="border-b border-slate-200 px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">{L.streak_label}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2 font-medium text-slate-900">
                    <Link href={`/admin/students/${r.student.id}`} className="hover:text-green-700 hover:underline">{r.student.full_name}</Link>
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-center">
                    <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold", levelBadgeClass(r.level))}>L{r.level}</span>
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="border-b border-slate-100 px-1.5 py-2 text-center">
                      <span
                        aria-label={c ?? L.mx_no_record}
                        title={c ?? L.mx_no_record}
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white",
                          c ? DOT[c] : "bg-slate-100 text-transparent ring-1 ring-inset ring-slate-200",
                        )}
                      >{c ? LETTER[c] : ""}</span>
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
        </>
      )}
    </div>
  );
}
