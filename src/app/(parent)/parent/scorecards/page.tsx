import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { monthLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default async function ParentScorecardsPage() {
  await requireRole("parent");
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("scorecards")
    .select("*, students(full_name)")
    .order("period_month", { ascending: false });

  return (
    <div>
      <PageHeader title="Score Cards" description="Monthly progress reports for your children." />

      {cards && cards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((c: any) => {
            const s = c.summary ?? {};
            return (
              <Card key={c.id} className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{c.students?.full_name ?? "—"}</div>
                    <div className="text-sm text-slate-500">{monthLabel(c.period_month)}</div>
                  </div>
                  <Badge tone={c.status === "sent" ? "green" : "blue"}>{c.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Avg score" value={s.avg_score != null ? Number(s.avg_score).toFixed(1) : "—"} />
                  <Tile label="Attendance" value={s.attendance_pct != null ? `${s.attendance_pct}%` : "—"} />
                  <Tile label="Points" value={s.reward_points ?? 0} />
                </div>
                {c.pdf_url && (
                  <a
                    href={`/api/scorecards/${c.id}/pdf`}
                    target="_blank"
                    rel="noopener"
                    className="mt-4 inline-block text-sm font-medium text-green-700 hover:underline"
                  >
                    Download PDF →
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No score cards available yet." />
      )}
    </div>
  );
}
