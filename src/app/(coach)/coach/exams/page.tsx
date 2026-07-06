import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Badge, EmptyState, LinkButton } from "@/components/ui";
import { nextExamWindow, isExamMonth, getExamEligibility, EXAM_ATTENDANCE_MIN_PCT } from "@/lib/training";
import { loadSyllabus } from "@/lib/syllabus";
import { dict } from "@/lib/i18n";
import { coachClassIds } from "../_data";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export default async function CoachExamsPage() {
  const me = await requireRole("coach");
  const L = dict(me.locale);
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);

  const win = nextExamWindow();
  const examMonth = isExamMonth();
  const { levels: syl } = await loadSyllabus();
  const nameByLevel = new Map(syl.map((l) => [l.level, l.name]));
  const levelName = (n: number) => nameByLevel.get(n) ?? "—";

  const students = new Map<string, { id: string; full_name: string; level: number | null; classes: string[] }>();
  if (classIds.length) {
    const { data: enr } = await supabase
      .from("enrollments")
      .select("student_id, students(id, full_name, level), classes(name)")
      .in("class_id", classIds)
      .eq("active", true);
    for (const e of enr ?? []) {
      const s = (e as any).students;
      const c = (e as any).classes;
      if (!s) continue;
      const row = students.get(s.id);
      if (row) {
        if (c?.name && !row.classes.includes(c.name)) row.classes.push(c.name);
      } else {
        students.set(s.id, { id: s.id, full_name: s.full_name, level: s.level ?? null, classes: c?.name ? [c.name] : [] });
      }
    }
  }

  // Latest exam per student (for the result chip).
  const ids = [...students.keys()];
  const lastExam = new Map<string, { total: number; band: string; decision: string; to_level: number }>();
  if (ids.length) {
    const { data: exams } = await supabase
      .from("level_exams")
      .select("student_id, total, band, decision, to_level, created_at")
      .in("student_id", ids)
      .order("created_at", { ascending: false });
    for (const ex of (exams ?? []) as any[]) {
      if (!lastExam.has(ex.student_id)) lastExam.set(ex.student_id, ex);
    }
  }

  // Eligibility (≥70% attendance over the last 90d) per student.
  const eligibility = new Map<string, Awaited<ReturnType<typeof getExamEligibility>>>();
  await Promise.all(
    ids.map(async (sid) => { eligibility.set(sid, await getExamEligibility(supabase, sid)); }),
  );

  const list = [...students.values()].sort((a, b) => {
    // Eligible first, then by name.
    const ea = eligibility.get(a.id)?.eligible ? 0 : 1;
    const eb = eligibility.get(b.id)?.eligible ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return a.full_name.localeCompare(b.full_name);
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={L.coach_assess}
        description={L.coach_exams_desc}
      />

      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-3 text-sm shadow-sm ${examMonth ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"}`}>
        <span className="font-medium text-slate-800">{examMonth ? L.window_open : L.next_window}</span>
        <span className={examMonth ? "text-green-700" : "text-slate-500"}>{win.label}</span>
        <span className="text-xs text-slate-400">{L.requires_att_prefix}{EXAM_ATTENDANCE_MIN_PCT}{L.requires_att_suffix}</span>
      </div>

      {list.length === 0 ? (
        <EmptyState message={L.no_students_assigned} />
      ) : (
        <Section title={`${L.your_students} (${list.length})`} flush>
          <ul className="divide-y divide-slate-100">
            {list.map((s) => {
              const ex = lastExam.get(s.id);
              const elig = eligibility.get(s.id);
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                    {initials(s.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/coach/exams/${s.id}`} className="block truncate font-medium text-slate-900 hover:text-green-700 hover:underline">{s.full_name}</Link>
                    <div className="truncate text-xs text-slate-400">
                      {s.level ? `${L.level_word} ${s.level} · ${levelName(s.level)}` : L.not_leveled}
                      {s.classes.length > 0 ? ` · ${s.classes.join(" · ")}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {elig && (
                      <Badge tone={elig.eligible ? "green" : "yellow"}>
                        {elig.attendedPct != null ? `${elig.attendedPct}%` : `${elig.attended}/${elig.total}`}
                      </Badge>
                    )}
                    {ex && (
                      <Badge tone={ex.band === "excellent" || ex.band === "pass" ? "green" : ex.band === "borderline" ? "yellow" : "red"}>
                        {ex.total}/100
                      </Badge>
                    )}
                    <LinkButton
                      href={`/coach/exams/${s.id}`}
                      variant={elig?.eligible ? "secondary" : "ghost"}
                      className="!px-3 !py-1.5 text-xs"
                      title={elig?.reason ?? undefined}
                    >
                      {elig?.eligible ? L.assess_btn : L.view_btn}
                    </LinkButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
