import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Section, Table, Th, Td, Badge, EmptyState, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { monthLabel } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";
import { waLink } from "@/lib/wa";
import { generateScorecards, logScorecardSend } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const { data: cards } = await supabase
    .from("scorecards")
    .select("*, students(full_name, parent:profiles!students_parent_id_fkey(full_name, phone, id))")
    .order("period_month", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Growth Reports"
        description="Monthly growth reports — character, skills & the HBA Growth Index. Generated reports auto-send to parents over WhatsApp (drip-throttled); per-card buttons below are a manual fallback."
      />

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
        <Section title={`Growth reports (${cards.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Student</Th><Th>Period</Th><Th>Growth index</Th><Th>Stage</Th>
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
        </Section>
      ) : (
        <EmptyState message="No growth reports yet. Generate this month's reports above." />
      )}
    </div>
  );
}
