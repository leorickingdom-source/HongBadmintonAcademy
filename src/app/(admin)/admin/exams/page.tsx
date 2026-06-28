import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Table, Th, Td, EmptyState, Badge, StatCard, LinkButton,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format";
import {
  nextExamWindow, isExamMonth, DECISION_LABEL, type Decision,
} from "@/lib/training";
import { loadSyllabus } from "@/lib/syllabus";
import { promoteFromExam } from "./actions";

export const dynamic = "force-dynamic";

const BAND_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "slate"> = {
  excellent: "green", pass: "blue", borderline: "yellow", fail: "red",
};

export default async function AdminExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ promoted?: string; error?: string }>;
}) {
  await requireRole("admin");
  const { promoted, error } = await searchParams;
  const supabase = await createClient();
  const win = nextExamWindow();
  const examMonth = isExamMonth();

  const [{ data: exams }, { data: students }, { levels: syl }] = await Promise.all([
    supabase
      .from("level_exams")
      .select("id, exam_date, window_label, from_level, to_level, total, band, decision, students(full_name, level), coach:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("students").select("level").eq("status", "active"),
    loadSyllabus(),
  ]);
  const nameByLevel = new Map(syl.map((l) => [l.level, l.name]));
  const levelName = (n: number) => nameByLevel.get(n) ?? "—";

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
        description="Coaches mark assessments; you approve promotions here. Exams run quarterly — January, April, July, October."
        action={<LinkButton href="/admin/training" variant="secondary">Syllabus</LinkButton>}
      />

      {promoted && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {promoted === "already" ? "That student is already at (or above) that level." : "Promoted — the parent has been notified."}
        </p>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-3 text-sm shadow-sm ${examMonth ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"}`}>
        <span className="font-medium text-slate-800">{examMonth ? "🏸 Exam window is open" : "Next exam window"}</span>
        <span className={examMonth ? "text-green-700" : "text-slate-500"}>{win.label}</span>
        <span className="text-slate-400">· Cycle: January / April / July / October</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active students" value={totalStudents} />
        <StatCard label="Exams recorded" value={(exams ?? []).length} />
        <StatCard label="Promotions" value={passes} tone="green" />
        <StatCard label="Elite (L5–6)" value={(dist.get(5) ?? 0) + (dist.get(6) ?? 0)} tone="blue" />
      </div>

      <Section title="Students by level" flush>
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-6">
          {syl.map((lv) => (
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
              <tr><Th>Date</Th><Th>Student</Th><Th>Level</Th><Th>Score</Th><Th>Result</Th><Th>Recommends</Th><Th>Coach</Th><Th className="text-right">Action</Th></tr>
            </thead>
            <tbody>
              {(exams as any[]).map((e) => {
                const canPromote = e.decision === "promote" && e.to_level <= 6 && Number(e.students?.level ?? 1) < Number(e.to_level);
                return (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>{formatDate(e.exam_date)}{e.window_label ? <span className="block text-xs text-slate-400">{e.window_label}</span> : null}</Td>
                  <Td className="font-medium text-slate-900">{e.students?.full_name ?? "—"}</Td>
                  <Td>{e.from_level} → {e.to_level > 6 ? "Elite" : `${e.to_level} (${levelName(e.to_level)})`}</Td>
                  <Td className="font-semibold tabular-nums">{e.total}/100</Td>
                  <Td><Badge tone={BAND_TONE[e.band] ?? "slate"}>{e.band ?? "—"}</Badge></Td>
                  <Td className="text-slate-600">{DECISION_LABEL[e.decision as Decision] ?? e.decision ?? "—"}</Td>
                  <Td className="text-slate-500">{e.coach?.full_name ?? "—"}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a href={`/api/exams/${e.id}/pdf`} target="_blank" rel="noopener" className="text-green-700 hover:underline">PDF</a>
                      {canPromote && (
                        <form action={promoteFromExam}>
                          <input type="hidden" name="exam_id" value={e.id} />
                          <SubmitButton pendingText="…" className="!px-2.5 !py-1 text-xs">⬆ Promote to L{e.to_level}</SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </tr>
              );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No exams recorded yet. Coaches grade them from their Exams page each window (Jan / Apr / Jul / Oct)." /></div>
        )}
      </Section>
    </div>
  );
}
