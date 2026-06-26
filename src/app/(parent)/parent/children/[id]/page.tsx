import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingUp, Calendar, CreditCard, Clock, MapPin, ChevronRight } from "lucide-react";
import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Card, Badge, cn } from "@/components/ui";
import { RankLadder } from "@/components/rank-ladder";
import { studentRank, rankBadgeClass } from "@/lib/ranks";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { levelInfo, levelName, nextExamWindow, DECISION_LABEL, bandFor, type Decision } from "@/lib/training";

export const dynamic = "force-dynamic";

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 3.15576e10);
}

// Parent child page — a calm SUMMARY. Full invoice / attendance / assessment
// tables live on the Fees, Schedule and Growth tabs; here we link out to them.
export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireParent();
  const { id } = await params;
  const supabase = createAdminClient();

  // Service-role bypasses RLS; restrict to this parent's child explicitly.
  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, status, dob, parent_id, rank, level, created_at, photo_url, fee_plans(name, amount, currency, interval)")
    .eq("id", id)
    .eq("parent_id", me.id)
    .maybeSingle();
  if (!student) notFound();

  const [
    { data: enrollment },
    { data: attendance },
    { data: assessments },
    { data: ledger },
    { data: invoices },
    { data: scorecard },
    { data: lastExam },
  ] = await Promise.all([
    supabase.from("enrollments").select("class_id, classes(name, level)").eq("student_id", id).eq("active", true).limit(1).maybeSingle(),
    supabase.from("attendance").select("status").eq("student_id", id).order("created_at", { ascending: false }).limit(60),
    supabase.from("assessments").select("overall_score").eq("student_id", id).order("assessed_on", { ascending: false }).limit(20),
    supabase.from("reward_ledger").select("points").eq("student_id", id),
    supabase.from("invoices").select("amount, currency, status, due_date").eq("student_id", id),
    supabase.from("scorecards").select("summary").eq("student_id", id).order("period_month", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("level_exams").select("id, exam_date, total, band, decision, to_level, next_target, window_label").eq("student_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const classId = (enrollment as any)?.class_id ?? null;
  const cls = (enrollment as any)?.classes ?? null;
  const today = new Date().toLocaleDateString("en-CA");
  const { data: nextRows } = classId
    ? await supabase
        .from("sessions")
        .select("session_date, start_time, end_time, location")
        .eq("class_id", classId)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
        .limit(1)
    : { data: [] as any[] };
  const next = (nextRows ?? [])[0] ?? null;

  const age = ageFromDob(student.dob);
  const currentRank = studentRank((student as any).rank, [cls?.level ?? null]);

  const att = attendance ?? [];
  const attended = att.filter((a: any) => a.status === "present" || a.status === "late").length;
  const rate = att.length ? Math.round((attended / att.length) * 100) : null;

  const scores = (assessments ?? []).map((a: any) => Number(a.overall_score)).filter((n) => !Number.isNaN(n));
  const avgScore = scores.length ? (scores.reduce((x, y) => x + y, 0) / scores.length).toFixed(0) : null;
  const growthIndex = (scorecard as any)?.summary?.growth_index ?? null;

  const points = (ledger ?? []).reduce((x: number, r: any) => x + Number(r.points), 0);

  const unpaid = (invoices ?? []).filter((i: any) => i.status === "unpaid" || i.status === "overdue");
  const outstanding = unpaid.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const currency = (invoices ?? [])[0]?.currency ?? "MYR";
  // Invoices never auto-flip to "overdue" — detect past-due from the date.
  const hasOverdue = unpaid.some((i: any) => i.due_date && i.due_date < today);
  const plan = (student as any).fee_plans ?? null;

  const level = (student as any).level ?? null;
  const lv = levelInfo(level);
  const exam = lastExam as any;
  const examWin = nextExamWindow();
  const examTone: Record<string, string> = {
    green: "border-green-200 bg-green-50 text-green-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    yellow: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };

  const subtitle = [age != null ? `${age} yrs` : null, cls?.name ?? null].filter(Boolean).join(" · ") || "No class enrolment yet";

  const LINKS = [
    { href: "/parent/scorecards", label: "View growth report", Icon: TrendingUp },
    { href: "/parent/schedule", label: "All sessions & attendance", Icon: Calendar },
    { href: "/parent/invoices", label: "Fees & payments", Icon: CreditCard },
  ];

  return (
    <div className="space-y-4">
      <Link href="/parent" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      {/* ── Header + rank ladder ─────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Avatar name={student.full_name} src={(student as any).photo_url} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-slate-900">{student.full_name}</span>
              {currentRank && (
                <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", rankBadgeClass(currentRank))}>{currentRank}</span>
              )}
              {student.status !== "active" && <Badge tone="slate">{student.status}</Badge>}
            </div>
            <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {student.dob ? `Born ${formatDate(student.dob)} · ` : ""}Member since {formatDate((student as any).created_at)}
        </div>
        <div className="mt-5">
          <RankLadder current={currentRank} />
        </div>
      </Card>

      {/* ── 3 quick stats ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-slate-900">{rate != null ? `${rate}%` : "—"}</div>
          <div className="mt-1 text-xs text-slate-500">Attendance</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{growthIndex != null ? growthIndex : "—"}</div>
          <div className="mt-1 text-xs text-slate-500">Growth index</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-slate-900">{points}</div>
          <div className="mt-1 text-xs text-slate-500">Reward points</div>
        </div>
      </div>

      {/* ── Training level & exams ───────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-lg font-bold text-green-700">
              {level ? `L${level}` : "—"}
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">{level ? `Level ${level} · ${levelName(level)}` : "Not yet leveled"}</div>
              {lv && <div className="text-xs text-slate-400">{lv.objective}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Next exam</div>
            <div className="text-sm font-medium text-slate-700">{examWin.label}</div>
          </div>
        </div>

        {exam ? (
          <div className={cn("mt-4 rounded-xl border p-3", examTone[bandFor(Number(exam.total)).tone])}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Last exam: {exam.total}/100 · {bandFor(Number(exam.total)).label}</span>
              <span className="text-xs opacity-70">{formatDate(exam.exam_date)}</span>
            </div>
            <div className="mt-1 text-xs opacity-90">
              {DECISION_LABEL[exam.decision as Decision] ?? exam.decision}
              {exam.next_target ? ` · Next target: ${exam.next_target}` : ""}
            </div>
            <a href={`/api/exams/${exam.id}/pdf`} target="_blank" rel="noopener" className="mt-2 inline-block text-xs font-medium underline">
              Download exam report (PDF)
            </a>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            No promotion exam yet. Exams run every 4 months — April, August, December.
          </div>
        )}
      </Card>

      {/* ── Fees (kept calm) ─────────────────────────────────────────────── */}
      {outstanding > 0 ? (
        <Link
          href="/parent/invoices"
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors",
            hasOverdue ? "border-red-200 bg-red-50 hover:bg-red-100/70" : "border-slate-200 bg-slate-50 hover:bg-slate-100",
          )}
        >
          <div className="min-w-0">
            <div className={cn("text-base font-semibold", hasOverdue ? "text-red-700" : "text-slate-900")}>{formatCurrency(outstanding, currency)} outstanding</div>
            <div className={cn("mt-0.5 text-xs", hasOverdue ? "font-medium text-red-600" : "text-slate-500")}>
              {hasOverdue
                ? "Overdue · please settle soon"
                : `${unpaid.length} invoice${unpaid.length > 1 ? "s" : ""} — settle whenever it's convenient`}
            </div>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              hasOverdue ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : "border-emerald-600 text-emerald-700 hover:bg-emerald-50",
            )}
          >
            {hasOverdue ? "Pay now" : "View & pay"}
          </span>
        </Link>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600">You&apos;re all paid up — thank you!</div>
      )}

      {plan && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="text-slate-500">Plan</span>
          <span className="font-medium text-slate-900">
            {plan.name} · {formatCurrency(Number(plan.amount), plan.currency)}{plan.interval === "monthly" ? "/mo" : ""}
          </span>
        </div>
      )}

      {/* ── Next session ─────────────────────────────────────────────────── */}
      {next && (
        <Card className="flex items-center gap-3.5 p-4">
          {(() => {
            const d = new Date(`${next.session_date}T00:00:00`);
            return (
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50">
                <span className="text-[10px] font-semibold uppercase text-emerald-600">{d.toLocaleDateString("en-MY", { month: "short" })}</span>
                <span className="text-lg font-bold leading-none text-emerald-800">{d.getDate()}</span>
              </div>
            );
          })()}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Next: {cls?.name ?? "Session"}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(next.start_time)}–{formatTime(next.end_time)}</span>
              {next.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{next.location}</span>}
            </div>
          </div>
        </Card>
      )}

      {/* ── Links out to the detail tabs ─────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-100">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center justify-between px-4 py-3.5 text-sm font-medium text-slate-900 hover:bg-slate-50">
              <span className="inline-flex items-center gap-2.5">
                <l.Icon className="h-4 w-4 text-emerald-600" />
                {l.label}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
