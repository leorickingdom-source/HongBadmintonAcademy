import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthLabel, formatDateTime } from "@/lib/format";
import { APP_NAME } from "@/lib/constants";
import { renderScorecardPdf } from "@/lib/scorecard-pdf";
import { ageFromDob, stageForAge, type GroupKey } from "@/lib/growth";

const BUCKET = "scorecards";

// First/last calendar day (YYYY-MM-DD) of the month containing `d`.
export function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => x.toLocaleDateString("en-CA");
  return { start: fmt(start), end: fmt(end) };
}

// Aggregate a month's data into a Monthly Growth Report per active student:
// grouped dimension scores, the HBA Growth Index (Character average), stage,
// and a year-over-year index trend. Renders a branded PDF and stores it.
//
// `db`      — reads + the scorecards upsert (cookie/RLS client for the manual
//             admin path, or the service-role client for headless cron).
// `storage` — PDF upload; must be the service-role client (private bucket).
// `month`   — any date within the target month (defaults to the current month).
export async function generateScorecardsCore(
  db: SupabaseClient,
  storage: SupabaseClient,
  month: Date = new Date(),
): Promise<{ generated: number }> {
  const { start, end } = monthBounds(month);
  const year = new Date(start).getFullYear();

  // Resolve each criterion to its group (covers any scheme, old or new).
  const { data: allCriteria } = await db.from("marking_criteria").select("id, name, category");
  const catById = new Map<string, GroupKey | null>();
  const catByName = new Map<string, GroupKey | null>();
  for (const c of allCriteria ?? []) {
    catById.set(c.id, (c.category as GroupKey) ?? null);
    catByName.set(String(c.name).toLowerCase(), (c.category as GroupKey) ?? null);
  }

  const { data: students } = await db
    .from("students")
    .select("id, full_name, dob")
    .eq("status", "active");

  let generated = 0;

  for (const s of students ?? []) {
    const [{ data: att }, { data: rewards }, { data: latest }, { data: prior }] = await Promise.all([
      db
        .from("attendance")
        .select("status, sessions!inner(session_date)")
        .eq("student_id", s.id)
        .gte("sessions.session_date", start)
        .lte("sessions.session_date", end),
      db
        .from("reward_ledger")
        .select("points")
        .eq("student_id", s.id)
        .gte("awarded_at", start)
        .lte("awarded_at", `${end}T23:59:59`),
      db
        .from("assessments")
        .select("id, comment, assessment_scores(criterion_id, criterion_name, score, max_score)")
        .eq("student_id", s.id)
        .gte("assessed_on", start)
        .lte("assessed_on", end)
        .order("assessed_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("scorecards")
        .select("period_month, summary")
        .eq("student_id", s.id)
        .order("period_month", { ascending: false })
        .limit(40),
    ]);

    const total = (att ?? []).length;
    const attended = (att ?? []).filter((a: any) => a.status === "present" || a.status === "late").length;
    const attendancePct = total ? Math.round((attended / total) * 100) : null;
    const rewardPoints = (rewards ?? []).reduce((x: number, r: any) => x + Number(r.points), 0);

    // Per-dimension scores from the latest assessment, normalized to 0–100.
    const rawScores = ((latest as any)?.assessment_scores ?? []) as any[];
    const dimensions = rawScores.map((c) => {
      const max = Number(c.max_score) || 1;
      const score = Math.round((Number(c.score) / max) * 100);
      const category =
        catById.get(c.criterion_id) ?? catByName.get(String(c.criterion_name).toLowerCase()) ?? null;
      return { name: String(c.criterion_name), category, score };
    });

    const groupAvg = (key: GroupKey): number | null => {
      const xs = dimensions.filter((d) => d.category === key).map((d) => d.score);
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    };
    const groups = { physical: groupAvg("physical"), technical: groupAvg("technical"), character: groupAvg("character") };
    const growthIndex = groups.character; // Character average = HBA Growth Index

    const overall = dimensions.map((d) => d.score);
    const avgScore = overall.length ? Math.round(overall.reduce((a, b) => a + b, 0) / overall.length) : null;

    const age = ageFromDob(s.dob);
    const stage = stageForAge(age);

    // Year trend: latest growth index per calendar year, last 3 incl. this one.
    const byYear = new Map<number, number>();
    if (growthIndex != null) byYear.set(year, growthIndex);
    for (const p of (prior ?? []) as any[]) {
      const py = new Date(p.period_month).getFullYear();
      const gi = p.summary?.growth_index;
      if (gi != null && !byYear.has(py)) byYear.set(py, Math.round(Number(gi)));
    }
    const trend = [...byYear.entries()].sort((a, b) => a[0] - b[0]).slice(-3).map(([y, index]) => ({ year: y, index }));

    const bytes = await renderScorecardPdf({
      academyName: APP_NAME,
      studentName: s.full_name,
      periodLabel: monthLabel(start),
      growthIndex,
      stage: stage?.label ?? null,
      groups,
      dimensions,
      attendancePct,
      sessionsAttended: attended,
      sessionsTotal: total,
      rewardPoints,
      trend,
      comment: (latest as any)?.comment ?? null,
      generatedAt: formatDateTime(new Date().toISOString()),
    });

    const path = `${s.id}/${start}.pdf`;
    await storage.storage.from(BUCKET).upload(path, Buffer.from(bytes), {
      upsert: true,
      contentType: "application/pdf",
    });

    await db.from("scorecards").upsert(
      {
        student_id: s.id,
        period_month: start,
        summary: {
          growth_index: growthIndex,
          avg_score: avgScore,
          groups,
          dimensions,
          stage: stage ? { key: stage.key, label: stage.label } : null,
          age,
          attendance_pct: attendancePct,
          sessions_attended: attended,
          sessions_total: total,
          reward_points: rewardPoints,
          assessments: rawScores.length ? 1 : 0,
          trend,
          comment: (latest as any)?.comment ?? null,
        },
        pdf_url: path,
        status: "generated",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,period_month" },
    );

    generated += 1;
  }

  return { generated };
}
