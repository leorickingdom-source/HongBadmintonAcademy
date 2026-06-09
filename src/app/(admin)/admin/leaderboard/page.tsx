import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, EmptyState } from "@/components/ui";
import { LeaderboardTable, type LbRow } from "@/components/leaderboard-table";

export const dynamic = "force-dynamic";

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
}

// Tiers by attendance rate (the academy's reward logic — tweak freely).
function rankOf(rate: number, attended: number): string {
  if (attended === 0) return "NONE";
  if (rate >= 85) return "LEGEND";
  if (rate >= 70) return "GOLD";
  if (rate >= 55) return "SILVER";
  return "BRONZE";
}

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const [{ data: students }, { data: att }] = await Promise.all([
    supabase.from("students").select("id, full_name, dob").eq("status", "active").order("full_name"),
    supabase.from("attendance").select("student_id, status, sessions(session_date)"),
  ]);

  const byStudent = new Map<string, { date: string; status: string }[]>();
  for (const a of att ?? []) {
    const date = (a as any).sessions?.session_date;
    if (!date) continue;
    const arr = byStudent.get(a.student_id) ?? [];
    arr.push({ date, status: a.status });
    byStudent.set(a.student_id, arr);
  }

  const rows: LbRow[] = (students ?? []).map((s: any) => {
    const recs = (byStudent.get(s.id) ?? []).sort((x, y) => x.date.localeCompare(y.date));
    const marked = recs.length;
    const attended = recs.filter((r) => r.status === "present" || r.status === "late").length;
    const rate = marked ? Math.round((attended / marked) * 100) : 0;
    let streak = 0;
    let max = 0;
    for (const r of recs) {
      if (r.status === "present" || r.status === "late") {
        streak++;
        if (streak > max) max = streak;
      } else {
        streak = 0;
      }
    }
    return { id: s.id, name: s.full_name, age: ageFrom(s.dob), attended, sessions: marked, rate, streak: max, rank: rankOf(rate, attended) };
  });

  return (
    <div>
      <PageHeader
        title="Students Leaderboard"
        description="Ranked by attendance — tap any column to sort."
        action={<LinkButton href="/admin/students" variant="ghost">Manage students →</LinkButton>}
      />
      {rows.length > 0 ? <LeaderboardTable rows={rows} /> : <EmptyState message="No active students yet." />}
    </div>
  );
}
