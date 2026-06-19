import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingUp, Calendar, CreditCard, Clock, MapPin, ChevronRight } from "lucide-react";
import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Card, Badge, cn } from "@/components/ui";
import { RankLadder } from "@/components/rank-ladder";
import { studentRank, rankBadgeClass } from "@/lib/ranks";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";

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
    .select("id, full_name, status, dob, parent_id, rank, created_at, photo_url, fee_plans(name, amount, currency, interval)")
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
  ] = await Promise.all([
    supabase.from("enrollments").select("class_id, classes(name, level)").eq("student_id", id).eq("active", true).limit(1).maybeSingle(),
    supabase.from("attendance").select("status").eq("student_id", id).order("created_at", { ascending: false }).limit(60),
    supabase.from("assessments").select("overall_score").eq("student_id", id).order("assessed_on", { ascending: false }).limit(20),
    supabase.from("reward_ledger").select("points").eq("student_id", id),
    supabase.from("invoices").select("amount, currency, status").eq("student_id", id),
    supabase.from("scorecards").select("summary").eq("student_id", id).order("period_month", { ascending: false }).limit(1).maybeSingle(),
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
  const plan = (student as any).fee_plans ?? null;

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

      {/* ── Fees (kept calm) ─────────────────────────────────────────────── */}
      {outstanding > 0 ? (
        <Link href="/parent/invoices" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{formatCurrency(outstanding, currency)} outstanding</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {unpaid.length} invoice{unpaid.length > 1 ? "s" : ""} — settle whenever it&apos;s convenient
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50">View &amp; pay</span>
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
