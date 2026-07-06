import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card, Badge, EmptyState, cn } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format";
import {
  bandFor, DECISION_LABEL, levelBadgeClass, nextExamWindow,
  type Decision,
} from "@/lib/training";
import { getLevelsMerged } from "@/lib/syllabus";
import { dict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const MDIMS = [
  { key: "fitness", label: "Fitness" },
  { key: "skills", label: "Skills" },
  { key: "attitude", label: "Attitude" },
] as const;
function dots(v: number | null) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cn("h-2 w-2 rounded-full", v && n <= v ? "bg-emerald-500" : "bg-slate-200")} />
      ))}
    </span>
  );
}

const BAND_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "slate"> = {
  excellent: "green", pass: "blue", borderline: "yellow", fail: "red",
};
const SEC_BAR: Record<string, string> = {
  technical: "bg-amber-500", footwork: "bg-blue-500", tactical: "bg-emerald-600", physical: "bg-purple-500",
};
const SEC_TRACK: Record<string, string> = {
  technical: "bg-amber-100", footwork: "bg-blue-100", tactical: "bg-emerald-100", physical: "bg-purple-100",
};
const SEC_ORDER = ["technical", "footwork", "tactical", "physical"];
const BAND_HERO: Record<string, string> = {
  excellent: "bg-emerald-50", pass: "bg-blue-50", borderline: "bg-amber-50", fail: "bg-red-50",
};

// Parent Progress Card — the student's promotion-exam result (the HBA v2 progress
// card). Replaces the retired monthly Growth Report. Shows the latest graded exam
// per child + history; the full breakdown is one tap away.
export default async function ParentProgressPage() {
  const me = await requireParent();
  const supabase = createAdminClient();
  const L = dict(me.locale);

  const { data: kids } = await supabase
    .from("students")
    .select("id, full_name, level")
    .eq("parent_id", me.id)
    .order("full_name");
  const kidIds = (kids ?? []).map((k: any) => k.id);

  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 10);

  const [{ data: exams }, { data: monthly }, { data: mAtt }, levels] = await Promise.all([
    kidIds.length
      ? supabase
          .from("level_exams")
          .select("id, student_id, exam_date, window_label, from_level, to_level, technical, footwork, tactical, physical, total, band, decision, scores, coach_comment, next_target")
          .in("student_id", kidIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    kidIds.length
      ? supabase.from("monthly_assessments").select("student_id, period_month, fitness, skills, attitude, comment").in("student_id", kidIds).gte("period_month", windowStart)
      : Promise.resolve({ data: [] as any[] }),
    kidIds.length
      ? supabase.from("attendance").select("student_id, status, sessions!inner(session_date)").in("student_id", kidIds).gte("sessions.session_date", windowStart)
      : Promise.resolve({ data: [] as any[] }),
    getLevelsMerged(),
  ]);
  const levelName = new Map(levels.map((l) => [l.level, l.name]));
  const win = nextExamWindow();

  // Group exams by child, newest first.
  const byKid = new Map<string, any[]>();
  for (const e of (exams ?? []) as any[]) {
    const arr = byKid.get(e.student_id) ?? [];
    arr.push(e);
    byKid.set(e.student_id, arr);
  }

  // Monthly marks + attendance, keyed by child+month (last 3 months).
  const months: string[] = [0, 1, 2].map((i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 10));
  const mKey = (sid: string, ym: string) => `${sid}:${ym}`;
  const monthlyBy = new Map<string, any>();
  for (const a of (monthly ?? []) as any[]) monthlyBy.set(mKey(a.student_id, a.period_month), a);
  const attBy = new Map<string, { came: number; total: number }>();
  for (const a of (mAtt ?? []) as any[]) {
    const k = mKey(a.student_id, `${a.sessions.session_date.slice(0, 7)}-01`);
    const e = attBy.get(k) ?? { came: 0, total: 0 };
    e.total++;
    if (a.status === "present" || a.status === "late") e.came++;
    attBy.set(k, e);
  }

  return (
    <div className="space-y-5">
      <PageHeader title={L.progress_card} description="Monthly marks + promotion-exam results in one place." />

      {!kids || kids.length === 0 ? (
        <EmptyState message="No children linked to your account yet. Contact the academy." />
      ) : (
        kids.map((k: any) => {
          const lvl = Number(k.level ?? 1);
          const history = byKid.get(k.id) ?? [];
          const latest = history[0] ?? null;
          return (
            <Card key={k.id} className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-slate-900">{k.full_name}</span>
                  <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", levelBadgeClass(lvl))}>
                    L{lvl} · {levelName.get(lvl) ?? "—"}
                  </span>
                </div>
                <span className="text-xs text-slate-400">Next exam: {win.label}</span>
              </div>

              {latest ? (
                <>
                  <div className={cn("flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between", BAND_HERO[latest.band] ?? "bg-slate-50")}>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Latest exam · {formatDate(latest.exam_date)}</div>
                      <div className="text-4xl font-bold leading-none text-slate-900">
                        {latest.total}<span className="ml-1 text-base font-medium text-slate-500">/100</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <Badge tone={BAND_TONE[latest.band] ?? "slate"}>{bandFor(Number(latest.total)).label}</Badge>
                      <span className="text-xs font-medium text-slate-600">{DECISION_LABEL[latest.decision as Decision] ?? latest.decision}</span>
                    </div>
                  </div>

                  <details className="group mt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <span className="transition-transform group-open:rotate-90">▸</span> See full breakdown
                    </summary>
                    <div className="mt-4 space-y-3">
                      {SEC_ORDER.map((key) => {
                        const sec = latest.scores?.[key];
                        if (!sec) return null;
                        const pct = sec.max ? Math.round((sec.subtotal / sec.max) * 100) : 0;
                        return (
                          <div key={key}>
                            <div className="flex justify-between text-xs text-slate-600">
                              <span>{sec.label}</span>
                              <span className="font-medium text-slate-900">{sec.subtotal}/{sec.max}</span>
                            </div>
                            <div className={cn("mt-1 h-1.5 rounded-full", SEC_TRACK[key])}>
                              <div className={cn("h-1.5 rounded-full", SEC_BAR[key])} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {latest.coach_comment && (
                        <p className="rounded-lg bg-slate-50 p-3 text-sm italic text-slate-700">“{latest.coach_comment}”</p>
                      )}
                      {latest.next_target && (
                        <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">Next target:</span> {latest.next_target}</p>
                      )}
                    </div>
                  </details>

                  <a href={`/api/exams/${latest.id}/pdf`} target="_blank" rel="noopener" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
                    Download exam report (PDF) →
                  </a>

                  {history.length > 1 && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Earlier exams</div>
                      <ul className="space-y-1.5">
                        {history.slice(1).map((h: any) => (
                          <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-slate-500">{formatDate(h.exam_date)} · L{h.from_level}→{h.to_level > 6 ? "Elite" : h.to_level}</span>
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-slate-700">{h.total}/100</span>
                              <Badge tone={BAND_TONE[h.band] ?? "slate"}>{h.band ?? "—"}</Badge>
                              <a href={`/api/exams/${h.id}/pdf`} target="_blank" rel="noopener" className="text-emerald-700 hover:underline">PDF</a>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No exam taken yet. Promotion exams run quarterly — January, April, July, October.
                </div>
              )}

              {/* ── Monthly marks (merged into the progress card) ─────────── */}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{L.monthly_marks_h}</span>
                  <a href={`/api/monthly-card/${k.id}/pdf`} target="_blank" rel="noopener" className="text-xs font-medium text-emerald-700 hover:underline">{L.download_card} →</a>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {months.map((m) => {
                    const a = monthlyBy.get(mKey(k.id, m));
                    const at = attBy.get(mKey(k.id, m));
                    const attPct = at && at.total ? Math.round((at.came / at.total) * 100) : null;
                    return (
                      <div key={m} className="rounded-lg border border-slate-200 p-3">
                        <div className="text-xs font-semibold text-slate-700">{monthLabel(m)}</div>
                        <div className="mt-1 text-xs text-slate-500">{L.attendance}: <span className="font-medium text-slate-800">{attPct == null ? "—" : `${attPct}%`}</span></div>
                        {a ? (
                          <div className="mt-1.5 space-y-1">
                            {MDIMS.map((d) => (
                              <div key={d.key} className="flex items-center justify-between">
                                <span className="text-[11px] text-slate-500">{L[d.key]}</span>
                                {dots(a[d.key])}
                              </div>
                            ))}
                            {a.comment && <p className="mt-1 text-[11px] italic text-slate-500">“{a.comment}”</p>}
                          </div>
                        ) : (
                          <div className="mt-1 text-[11px] text-slate-400">{L.marks_not_in}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
