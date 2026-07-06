import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, cn } from "@/components/ui";
import { monthLabel } from "@/lib/format";
import { coachClassIds } from "../_data";
import { AssessBoard, type AssessRow } from "./assess-board";

export const dynamic = "force-dynamic";

function mytNow(): Date {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

export default async function CoachAssessPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; month?: string }>;
}) {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const { class: classParam, month } = await searchParams;

  const classIds = await coachClassIds(supabase, me.id);
  const { data: classes } = classIds.length
    ? await supabase.from("classes").select("id, name").in("id", classIds).eq("is_active", true).order("name")
    : { data: [] as any[] };

  // Month being graded (YYYY-MM) — this month or last month only.
  const now = mytNow();
  const thisM = now.toISOString().slice(0, 7);
  const lastM = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const monthStr = month === lastM ? lastM : thisM;
  const period = `${monthStr}-01`;

  const activeClass =
    (classes ?? []).find((c: any) => c.id === classParam)?.id ?? (classes ?? [])[0]?.id ?? null;

  let rows: AssessRow[] = [];
  if (activeClass) {
    const [{ data: enr }, { data: existing }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("students(id, full_name, nickname, photo_url)")
        .eq("class_id", activeClass)
        .eq("active", true),
      supabase
        .from("monthly_assessments")
        .select("student_id, fitness, skills, attitude, comment")
        .eq("period_month", period),
    ]);
    const byStudent = new Map((existing ?? []).map((a: any) => [a.student_id, a]));
    rows = (enr ?? [])
      .map((e: any) => e.students)
      .filter(Boolean)
      .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name))
      .map((st: any) => {
        const a = byStudent.get(st.id);
        return {
          student: st,
          fitness: a?.fitness ?? null,
          skills: a?.skills ?? null,
          attitude: a?.attitude ?? null,
          comment: a?.comment ?? null,
        };
      });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monthly marks"
        description="Grade the whole class for the month — Fitness, Skills, Attitude (1–5) + a note for the parent. Every tap saves."
      />

      {(classes ?? []).length === 0 ? (
        <EmptyState message="You're not assigned to any classes yet." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(classes ?? []).map((c: any) => (
              <Link
                key={c.id}
                href={`/coach/assess?class=${c.id}&month=${monthStr}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
                  c.id === activeClass ? "bg-green-600 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                )}
              >
                {c.name}
              </Link>
            ))}
            <span className="mx-1 h-5 w-px bg-slate-200" />
            {[thisM, lastM].map((m) => (
              <Link
                key={m}
                href={`/coach/assess?class=${activeClass ?? ""}&month=${m}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
                  m === monthStr ? "bg-slate-800 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                )}
              >
                {monthLabel(`${m}-01`)}
              </Link>
            ))}
          </div>

          {activeClass ? (
            <AssessBoard key={`${activeClass}:${period}`} classId={activeClass} period={period} initialRows={rows} />
          ) : (
            <EmptyState message="Pick a class." />
          )}
        </>
      )}
    </div>
  );
}
