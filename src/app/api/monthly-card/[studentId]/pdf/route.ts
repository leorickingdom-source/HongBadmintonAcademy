import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getParentIdFromCookie } from "@/lib/parent-auth";
import { renderMonthlyCardPdf, type MonthlyCardMonth } from "@/lib/monthly-card-pdf";
import { APP_NAME } from "@/lib/constants";
import { monthLabel, formatDate } from "@/lib/format";
import { getLevelInfoMerged } from "@/lib/syllabus";

export const runtime = "nodejs";

// Monthly progress card PDF for one child (last 3 months). Admin/coach via RLS
// client; parent via signed cookie + ownership. Renders even with no data
// (blank months) so it's always downloadable.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let student: any = null;
  const sel = "id, full_name, level, branches(name)";
  if (user) {
    const { data } = await supabase.from("students").select(sel).eq("id", studentId).maybeSingle();
    student = data;
  } else {
    const pid = await getParentIdFromCookie();
    if (pid) {
      const admin = createAdminClient();
      const { data } = await admin.from("students").select(sel).eq("id", studentId).eq("parent_id", pid).maybeSingle();
      student = data;
    }
  }
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = createAdminClient();
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const monthKeys = [0, 1, 2].map((i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 10));
  const windowStart = monthKeys[monthKeys.length - 1];

  const [{ data: assess }, { data: att }, { data: marks }, { data: rewards }] = await Promise.all([
    db.from("monthly_assessments").select("period_month, fitness, skills, attitude, comment").eq("student_id", studentId).gte("period_month", windowStart),
    db.from("attendance").select("status, sessions!inner(session_date)").eq("student_id", studentId).gte("sessions.session_date", windowStart),
    db.from("session_marks").select("rating, sessions!inner(session_date)").eq("student_id", studentId).gte("sessions.session_date", windowStart),
    db.from("reward_ledger").select("points, awarded_at").eq("student_id", studentId).gte("awarded_at", `${windowStart}T00:00:00Z`),
  ]);

  const mOf = (dstr: string) => `${dstr.slice(0, 7)}-01`;
  const aBy = new Map<string, any>();
  for (const a of (assess ?? []) as any[]) aBy.set(a.period_month, a);
  const attBy = new Map<string, { c: number; t: number }>();
  for (const a of (att ?? []) as any[]) {
    const k = mOf(a.sessions.session_date); const e = attBy.get(k) ?? { c: 0, t: 0 }; e.t++;
    if (a.status === "present" || a.status === "late") e.c++; attBy.set(k, e);
  }
  const mkBy = new Map<string, { s: number; n: number }>();
  for (const m of (marks ?? []) as any[]) {
    const k = mOf(m.sessions.session_date); const e = mkBy.get(k) ?? { s: 0, n: 0 }; e.s += Number(m.rating); e.n++; mkBy.set(k, e);
  }
  const ptBy = new Map<string, number>();
  for (const r of (rewards ?? []) as any[]) {
    const k = mOf(String(r.awarded_at).slice(0, 10)); ptBy.set(k, (ptBy.get(k) ?? 0) + Number(r.points));
  }

  const months: MonthlyCardMonth[] = monthKeys.map((k) => {
    const a = aBy.get(k); const at = attBy.get(k); const mk = mkBy.get(k);
    return {
      label: monthLabel(k),
      attendancePct: at && at.t ? Math.round((at.c / at.t) * 100) : null,
      avgRating: mk && mk.n ? Math.round((mk.s / mk.n) * 10) / 10 : null,
      fitness: a?.fitness ?? null, skills: a?.skills ?? null, attitude: a?.attitude ?? null,
      comment: a?.comment ?? null, points: ptBy.get(k) ?? 0,
    };
  });

  const lvl = Number(student.level ?? 1);
  const lvlName = (await getLevelInfoMerged(lvl))?.name ?? "-";
  const bytes = await renderMonthlyCardPdf({
    academyName: APP_NAME,
    studentName: student.full_name,
    branchName: student.branches?.name ?? null,
    levelLine: `Level ${lvl} · ${lvlName}`,
    months,
    generatedAt: formatDate(new Date()),
  });

  const safe = String(student.full_name).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="progress-card-${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
