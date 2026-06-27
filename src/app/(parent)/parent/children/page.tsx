import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card, Avatar, Badge, EmptyState, cn } from "@/components/ui";
import { levelBadgeClass } from "@/lib/training";
import { getLevelsMerged } from "@/lib/syllabus";

export const dynamic = "force-dynamic";

// Dedicated children list — reachable from the nav (not only the dashboard).
// Mirrors the dashboard cards but always lists every child, newest report first.
export default async function ParentChildrenPage() {
  const me = await requireParent();
  const supabase = createAdminClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, status, photo_url, level")
    .eq("parent_id", me.id)
    .order("full_name");
  const ids = (children ?? []).map((c: any) => c.id);

  const [{ data: enr }, { data: exams }, levels] = await Promise.all([
    ids.length
      ? supabase.from("enrollments").select("student_id, classes(name)").in("student_id", ids).eq("active", true)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? supabase.from("level_exams").select("student_id, total, created_at").in("student_id", ids).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    getLevelsMerged(),
  ]);

  const className = new Map<string, string>();
  for (const e of (enr ?? []) as any[]) {
    if (e.classes?.name && !className.has(e.student_id)) className.set(e.student_id, e.classes.name);
  }
  const lastExam = new Map<string, number>();
  for (const ex of (exams ?? []) as any[]) {
    if (!lastExam.has(ex.student_id)) lastExam.set(ex.student_id, ex.total);
  }
  const levelName = new Map(levels.map((l) => [l.level, l.name]));

  return (
    <div>
      <PageHeader title="My Children" description="Tap a child to see their level, progress card, schedule and fees." />

      {children && children.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {children.map((c: any) => {
            const lvl = Number(c.level ?? 1);
            const total = lastExam.get(c.id);
            return (
              <Link key={c.id} href={`/parent/children/${c.id}`} className="group">
                <Card className="h-full p-4 transition-all hover:border-emerald-300 hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.full_name} src={c.photo_url} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900 group-hover:text-emerald-700">{c.full_name}</span>
                        <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", levelBadgeClass(lvl))}>
                          L{lvl} · {levelName.get(lvl) ?? "—"}
                        </span>
                        {c.status !== "active" && <Badge tone="slate">{c.status}</Badge>}
                      </div>
                      <div className="mt-0.5 text-sm text-slate-500">{className.get(c.id) ?? "Not enrolled"}</div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    {total != null ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-emerald-700">{total}</span>
                        <span className="text-xs font-medium text-slate-400">/100 last exam</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No exam yet</span>
                    )}
                    <span className="text-sm font-medium text-emerald-700">Open →</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No children linked to your account yet. Contact the academy." />
      )}
    </div>
  );
}
