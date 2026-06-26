import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Table, Th, Td, EmptyState, Badge, StatCard, LinkButton,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  TRAINING_LEVELS, levelName, nextExamWindow, isExamMonth, DECISION_LABEL, type Decision,
} from "@/lib/training";

export const dynamic = "force-dynamic";

const BAND_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "slate"> = {
  excellent: "green", pass: "blue", borderline: "yellow", fail: "red",
};

export default async function AdminExamsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const win = nextExamWindow();
  const examMonth = isExamMonth();

  const [{ data: exams }, { data: students }] = await Promise.all([
    supabase
      .from("level_exams")
      .select("id, exam_date, window_label, from_level, to_level, total, band, decision, students(full_name), coach:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("students").select("level").eq("status", "active"),
  ]);

  // Level distribution across active students (null = not yet leveled → Level 1).
  const dist = new Map<number, number>();
  for (const s of (students ?? []) as any[]) {
    const lv = s.level ?? 1;
    dist.set(lv, (dist.get(lv) ?? 0) + 1);
  }
  const totalStudents = (students ?? []).length;
  const passes = (exams ?? []).filter((e: any) => e.decision === "promote").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Level exams"
        description="Promotion-exam results across the academy. Exams run every 4 months — April, August, December."
        action={<LinkButton href="/admin/training" variant="secondary">Syllabus</LinkButton>}
      />

      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-3 text-sm shadow-sm ${examMonth ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"}`}>
        <span className="font-medium text-slate-800">{examMonth ? "🏸 Exam window is open" : "Next exam window"}</span>
        <span className={examMonth ? "text-green-700" : "text-slate-500"}>{win.label}</span>
        <span className="text-slate-400">· Cycle: April / August / December</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active students" value={totalStudents} />
        <StatCard label="Exams recorded" value={(exams ?? []).length} />
        <StatCard label="Promotions" value={passes} tone="green" />
        <StatCard label="Elite (L5–6)" value={(dist.get(5) ?? 0) + (dist.get(6) ?? 0)} tone="blue" />
      </div>

      <Section title="Students by level" flush>
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-6">
          {TRAINING_LEVELS.map((lv) => (
            <div key={lv.level} className="bg-white p-4 text-center">
              <div className="text-2xl font-bold tabular-nums text-slate-900">{dist.get(lv.level) ?? 0}</div>
              <div className="mt-1 text-xs text-slate-500">L{lv.level} · {lv.name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recent exams" flush>
        {exams && exams.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Student</Th><Th>Level</Th><Th>Score</Th><Th>Result</Th><Th>Decision</Th><Th>Coach</Th><Th>PDF</Th></tr>
            </thead>
            <tbody>
              {(exams as any[]).map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>{formatDate(e.exam_date)}{e.window_label ? <span className="block text-xs text-slate-400">{e.window_label}</span> : null}</Td>
                  <Td className="font-medium text-slate-900">{e.students?.full_name ?? "—"}</Td>
                  <Td>{e.from_level} → {e.to_level > 6 ? "Elite" : `${e.to_level} (${levelName(e.to_level)})`}</Td>
                  <Td className="font-semibold tabular-nums">{e.total}/100</Td>
                  <Td><Badge tone={BAND_TONE[e.band] ?? "slate"}>{e.band ?? "—"}</Badge></Td>
                  <Td className="text-slate-600">{DECISION_LABEL[e.decision as Decision] ?? e.decision ?? "—"}</Td>
                  <Td className="text-slate-500">{e.coach?.full_name ?? "—"}</Td>
                  <Td><a href={`/api/exams/${e.id}/pdf`} target="_blank" rel="noopener" className="text-green-700 hover:underline">PDF</a></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No exams recorded yet. Coaches grade exams under Level Exams." /></div>
        )}
      </Section>
    </div>
  );
}
