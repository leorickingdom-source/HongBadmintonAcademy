import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Collapsible, Table, Th, Td, Badge, EmptyState, LinkButton, cn } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { monthLabel } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";
import { waLink } from "@/lib/wa";
import { bestRank, rankBadgeClass } from "@/lib/ranks";
import { generateScorecards, logScorecardSend } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScorecardsPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string; notice?: string }>;
}) {
  const { generated, notice } = await searchParams;
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const { data: cards } = await supabase
    .from("scorecards")
    .select("*, students(full_name, parent:profiles!students_parent_id_fkey(full_name, phone, id))")
    .order("period_month", { ascending: false })
    .order("created_at", { ascending: false });

  // Class rank per student (highest tier among enrolled classes) for the report list.
  const studentIds = [...new Set((cards ?? []).map((c: any) => c.student_id))];
  const { data: enrollments } = studentIds.length
    ? await supabase.from("enrollments").select("student_id, classes(level)").eq("active", true).in("student_id", studentIds)
    : { data: [] as any[] };
  const levelsByStudent = new Map<string, (string | null)[]>();
  for (const e of (enrollments ?? []) as any[]) {
    const arr = levelsByStudent.get(e.student_id) ?? [];
    arr.push(e.classes?.level ?? null);
    levelsByStudent.set(e.student_id, arr);
  }
  const rankOf = (id: string) => bestRank(levelsByStudent.get(id) ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Growth Reports"
        description="Monthly growth reports — character, skills & the HBA Growth Index. When reports are generated, one privacy-safe notice is auto-posted to the parent WhatsApp Community (no names/scores). Per-card buttons below send an individual report to one parent."
      />

      {generated !== undefined && (
        (() => {
          const n = Number(generated);
          const map: Record<string, { tone: string; msg: string }> = {
            queued: { tone: "border-green-200 bg-green-50 text-green-800", msg: "Community notice queued — the worker will post it to the parent WhatsApp Community shortly." },
            updated: { tone: "border-green-200 bg-green-50 text-green-800", msg: "This month's Community notice was refreshed (it will include fees too once invoices are raised)." },
            "already-sent": { tone: "border-blue-200 bg-blue-50 text-blue-800", msg: "This month's Community notice was already posted — not duplicated." },
            skipped: { tone: "border-slate-200 bg-slate-50 text-slate-700", msg: "Nothing to announce to the Community yet." },
            "no-group-id": { tone: "border-amber-200 bg-amber-50 text-amber-800", msg: "⚠️ No Community group configured — set WA_COMMUNITY_GROUP_ID in Vercel to auto-post the notice." },
          };
          const m = map[notice ?? ""] ?? { tone: "border-slate-200 bg-slate-50 text-slate-700", msg: "" };
          return (
            <div className={`rounded-xl border p-4 text-sm ${m.tone}`}>
              <strong>Generated {n} report{n === 1 ? "" : "s"} for {monthLabel(new Date().toISOString())}.</strong>{" "}
              {m.msg}
            </div>
          );
        })()
      )}

      <Card className="flex flex-wrap items-center justify-between gap-4 border-green-200 bg-green-50 p-5">
        <div className="text-sm text-green-800">
          Generate growth reports for <strong>{monthLabel(new Date().toISOString())}</strong> from this
          month&apos;s assessments, attendance and rewards.
        </div>
        <form action={generateScorecards}>
          <SubmitButton pendingText="Generating…">Generate this month</SubmitButton>
        </form>
      </Card>

      {cards && cards.length > 0 ? (
        <Collapsible title="Growth reports" count={cards.length}>
          <Table>
            <thead>
              <tr>
                <Th>Student</Th><Th>Rank</Th><Th>Period</Th><Th>Growth index</Th><Th>Stage</Th>
                <Th>Attendance</Th><Th>Status</Th><Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c: any) => {
                const s = c.summary ?? {};
                const parent = c.students?.parent;
                const text =
                  `🏸 ${monthLabel(c.period_month)} growth report — ${c.students?.full_name ?? "your child"}\n` +
                  `• HBA Growth Index: ${s.growth_index != null ? s.growth_index : "—"}/100\n` +
                  (s.stage?.label ? `• Stage: ${s.stage.label}\n` : "") +
                  `• Attendance: ${s.attendance_pct != null ? s.attendance_pct + "%" : "—"}\n` +
                  `View full report: ${baseUrl}/parent/scorecards`;
                const waUrl = waLink(parent?.phone, text);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{c.students?.full_name ?? "—"}</Td>
                    <Td label="Rank">
                      {rankOf(c.student_id) ? (
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(rankOf(c.student_id)))}>{rankOf(c.student_id)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td>{monthLabel(c.period_month)}</Td>
                    <Td className="tabular-nums">
                      {s.growth_index != null ? <span className="font-semibold text-emerald-700">{s.growth_index}</span> : "—"}
                    </Td>
                    <Td>{s.stage?.label ? <Badge tone="yellow">{s.stage.label}</Badge> : "—"}</Td>
                    <Td className="tabular-nums">{s.attendance_pct != null ? `${s.attendance_pct}%` : "—"}</Td>
                    <Td>
                      <Badge tone={c.status === "sent" ? "green" : c.status === "generated" ? "blue" : "slate"}>
                        {c.status}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        {c.pdf_url && (
                          <LinkButton href={`/api/scorecards/${c.id}/pdf`} target="_blank" rel="noopener" variant="secondary">
                            PDF
                          </LinkButton>
                        )}
                        <WhatsAppButton
                          waUrl={waUrl}
                          action={logScorecardSend}
                          fields={{
                            scorecard_id: c.id,
                            recipient_phone: parent?.phone ?? "",
                            recipient_profile_id: parent?.id ?? "",
                            body: text,
                          }}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Collapsible>
      ) : (
        <EmptyState message="No growth reports yet. Generate this month's reports above." />
      )}
    </div>
  );
}
