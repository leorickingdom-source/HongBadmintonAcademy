import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card, EmptyState, Avatar, cn } from "@/components/ui";
import { Star } from "lucide-react";
import { monthLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const DIMS = [
  { key: "fitness", label: "Fitness" },
  { key: "skills", label: "Skills" },
  { key: "attitude", label: "Attitude" },
] as const;

function dotRow(v: number | null) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn("h-2.5 w-2.5 rounded-full", v && n <= v ? "bg-emerald-500" : "bg-slate-200")}
        />
      ))}
    </span>
  );
}

// Monthly report card per child — coach's monthly marks + attendance + session
// ratings + reward points, month by month. Exams stay on the Progress Card page.
export default async function ParentReportsPage() {
  const me = await requireParent();
  const db = createAdminClient();

  const { data: children } = await db
    .from("students")
    .select("id, full_name, photo_url")
    .eq("parent_id", me.id)
    .order("full_name");
  const childIds = (children ?? []).map((c) => c.id);

  if (!childIds.length) {
    return (
      <div>
        <PageHeader title="Monthly report" />
        <EmptyState message="No children linked to your account." />
      </div>
    );
  }

  // Last 6 months (newest first), MYT.
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 10));
  }
  const windowStart = months[months.length - 1];

  const [{ data: assessments }, { data: att }, { data: marks }, { data: rewards }] = await Promise.all([
    db
      .from("monthly_assessments")
      .select("student_id, period_month, fitness, skills, attitude, comment")
      .in("student_id", childIds)
      .gte("period_month", windowStart),
    db
      .from("attendance")
      .select("student_id, status, sessions!inner(session_date)")
      .in("student_id", childIds)
      .gte("sessions.session_date", windowStart),
    db
      .from("session_marks")
      .select("student_id, rating, sessions!inner(session_date)")
      .in("student_id", childIds)
      .gte("sessions.session_date", windowStart),
    db
      .from("reward_ledger")
      .select("student_id, points, awarded_at")
      .in("student_id", childIds)
      .gte("awarded_at", `${windowStart}T00:00:00Z`),
  ]);

  const keyOf = (studentId: string, ym: string) => `${studentId}:${ym}`;
  const monthOf = (d: string) => `${d.slice(0, 7)}-01`;

  const assessBy = new Map<string, any>();
  for (const a of (assessments ?? []) as any[]) assessBy.set(keyOf(a.student_id, a.period_month), a);

  const attBy = new Map<string, { came: number; total: number }>();
  for (const a of (att ?? []) as any[]) {
    const k = keyOf(a.student_id, monthOf(a.sessions.session_date));
    const e = attBy.get(k) ?? { came: 0, total: 0 };
    e.total++;
    if (a.status === "present" || a.status === "late") e.came++;
    attBy.set(k, e);
  }

  const markBy = new Map<string, { sum: number; n: number }>();
  for (const m of (marks ?? []) as any[]) {
    const k = keyOf(m.student_id, monthOf(m.sessions.session_date));
    const e = markBy.get(k) ?? { sum: 0, n: 0 };
    e.sum += Number(m.rating);
    e.n++;
    markBy.set(k, e);
  }

  const pointsBy = new Map<string, number>();
  for (const r of (rewards ?? []) as any[]) {
    const k = keyOf(r.student_id, monthOf(String(r.awarded_at).slice(0, 10)));
    pointsBy.set(k, (pointsBy.get(k) ?? 0) + Number(r.points));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Monthly report"
        description="How each month went — coach's marks, attendance and rewards. Exam results live on the Progress Card."
      />

      {(children ?? []).map((c) => {
        // Show months that have anything to say (always include the current one).
        const rows = months.filter((m, i) => {
          if (i === 0) return true;
          const k = keyOf(c.id, m);
          return assessBy.has(k) || attBy.has(k) || pointsBy.has(k);
        });
        return (
          <section key={c.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={c.full_name} src={(c as any).photo_url} size={36} />
              <h2 className="text-lg font-semibold text-slate-900">{c.full_name}</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((m) => {
                const k = keyOf(c.id, m);
                const a = assessBy.get(k);
                const at = attBy.get(k);
                const mk = markBy.get(k);
                const pts = pointsBy.get(k) ?? 0;
                const attPct = at && at.total ? Math.round((at.came / at.total) * 100) : null;
                const avgMark = mk && mk.n ? Math.round((mk.sum / mk.n) * 10) / 10 : null;
                const emptyMonth = !a && attPct == null && !pts;
                return (
                  <Card key={m} className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{monthLabel(m)}</span>
                      {pts > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">+{pts} pts</span>
                      )}
                    </div>

                    {emptyMonth ? (
                      <p className="text-sm text-slate-400">Nothing recorded this month yet.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                          <span className="text-slate-600">
                            Attendance{" "}
                            <span className={cn("font-semibold", attPct == null ? "text-slate-300" : attPct >= 80 ? "text-green-600" : attPct >= 50 ? "text-amber-600" : "text-red-600")}>
                              {attPct == null ? "—" : `${attPct}%`}
                            </span>
                            {at ? <span className="text-xs text-slate-400"> ({at.came}/{at.total})</span> : null}
                          </span>
                          {avgMark != null && (
                            <span className="inline-flex items-center gap-1 text-slate-600">
                              <Star className="h-3.5 w-3.5 text-amber-500" /> {avgMark}/5 avg session rating
                            </span>
                          )}
                        </div>

                        {a ? (
                          <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                            {DIMS.map((d) => (
                              <div key={d.key} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">{d.label}</span>
                                {dotRow(a[d.key])}
                              </div>
                            ))}
                            {a.comment && <p className="pt-1 text-sm italic text-slate-600">“{a.comment}”</p>}
                          </div>
                        ) : (
                          <p className="border-t border-slate-100 pt-2.5 text-xs text-slate-400">Coach's monthly marks not in yet.</p>
                        )}
                      </>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
