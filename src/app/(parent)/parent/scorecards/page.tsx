import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card, Badge, EmptyState, cn } from "@/components/ui";
import { monthLabel } from "@/lib/format";
import { GROUP_LABEL, type GroupKey } from "@/lib/growth";

export const dynamic = "force-dynamic";

const GROUP_BAR: Record<GroupKey, string> = {
  physical: "bg-blue-500",
  technical: "bg-amber-500",
  character: "bg-emerald-600",
};
const GROUP_TRACK: Record<GroupKey, string> = {
  physical: "bg-blue-100",
  technical: "bg-amber-100",
  character: "bg-emerald-100",
};
const GROUP_ORDER: GroupKey[] = ["physical", "technical", "character"];

function GroupBlock({ group, dims }: { group: GroupKey; dims: { name: string; score: number }[] }) {
  if (!dims.length) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{GROUP_LABEL[group]}</div>
      <div className="space-y-2">
        {dims.map((d) => (
          <div key={d.name}>
            <div className="flex justify-between text-xs text-slate-600">
              <span>{d.name}</span>
              <span className="font-medium text-slate-900">{d.score}</span>
            </div>
            <div className={`mt-1 h-1.5 rounded-full ${GROUP_TRACK[group]}`}>
              <div className={`h-1.5 rounded-full ${GROUP_BAR[group]}`} style={{ width: `${Math.max(0, Math.min(100, d.score))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ParentScorecardsPage() {
  const me = await requireParent();
  const supabase = createAdminClient();

  // Scope to this parent's children only — service-role bypasses RLS so we
  // must filter explicitly.
  const { data: kids } = await supabase
    .from("students")
    .select("id")
    .eq("parent_id", me.id);
  const kidIds = (kids ?? []).map((k: any) => k.id);

  const { data: cards } = kidIds.length
    ? await supabase
        .from("scorecards")
        .select("*, students(full_name)")
        .in("student_id", kidIds)
        .order("period_month", { ascending: false })
    : { data: [] as any[] };

  return (
    <div>
      <PageHeader title="Growth Reports" description="Your child's monthly character & skills growth." />

      {cards && cards.length > 0 ? (
        <div className="space-y-4">
          {cards.map((c: any) => {
            const s = c.summary ?? {};
            const dims: { name: string; category: GroupKey | null; score: number }[] = s.dimensions ?? [];
            const trend: { year: number; index: number }[] = s.trend ?? [];
            return (
              <Card key={c.id} className="p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{c.students?.full_name ?? "—"}</div>
                    <div className="text-sm text-slate-500">{monthLabel(c.period_month)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.stage?.label && <Badge tone="yellow">{s.stage.label}</Badge>}
                    <Badge tone={c.status === "sent" ? "green" : "blue"}>{c.status}</Badge>
                  </div>
                </div>

                {/* Headline: the one thing a parent needs — index + coach's line. */}
                <div className="flex flex-col gap-3 rounded-xl bg-emerald-50 p-5 sm:flex-row sm:items-center sm:gap-x-6">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-xs font-medium text-emerald-700">HBA Growth Index</div>
                      <div className="text-5xl font-bold leading-none text-emerald-900">
                        {s.growth_index != null ? s.growth_index : "—"}
                        <span className="ml-1 text-base font-medium text-emerald-700">/100</span>
                      </div>
                    </div>
                    {trend.length > 1 && (() => {
                      const delta = trend[trend.length - 1].index - trend[trend.length - 2].index;
                      return (
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold", delta >= 0 ? "bg-emerald-200 text-emerald-900" : "bg-amber-100 text-amber-800")}>
                          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs last year
                        </span>
                      );
                    })()}
                  </div>
                  {s.comment && (
                    <p className="min-w-[12rem] flex-1 text-sm italic text-emerald-900">“{s.comment}”</p>
                  )}
                </div>

                {/* Everything else is one tap away — keeps it light for non-tech parents. */}
                <details className="group mt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <span className="transition-transform group-open:rotate-90">▸</span> See full breakdown
                  </summary>
                  <div className="mt-4 space-y-5">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                      <span>Attendance <span className="font-semibold text-slate-900">{s.attendance_pct != null ? `${s.attendance_pct}%` : "—"}</span></span>
                      <span>Reward points <span className="font-semibold text-slate-900">{s.reward_points ?? 0}</span></span>
                    </div>
                    {trend.length > 1 && (
                      <div className="flex items-end gap-2">
                        {trend.map((t, i) => (
                          <div key={t.year} className="flex items-end gap-2">
                            {i > 0 && <span className="pb-2 text-emerald-500">→</span>}
                            <div className="text-center">
                              <div className="flex h-9 min-w-9 items-center justify-center rounded-md bg-emerald-200 px-2 text-sm font-semibold text-emerald-900">{t.index}</div>
                              <div className="mt-1 text-[11px] text-emerald-700">{t.year}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-5 sm:grid-cols-3">
                      {GROUP_ORDER.map((g) => (
                        <GroupBlock key={g} group={g} dims={dims.filter((d) => d.category === g)} />
                      ))}
                    </div>
                  </div>
                </details>

                {c.pdf_url && (
                  <a
                    href={`/api/scorecards/${c.id}/pdf`}
                    className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline"
                  >
                    Download PDF →
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No growth reports available yet." />
      )}
    </div>
  );
}
