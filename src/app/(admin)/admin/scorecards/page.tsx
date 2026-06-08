import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Table, Th, Td, Badge, EmptyState, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { monthLabel, formatDateTime } from "@/lib/format";
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
        title="Score Cards"
        description="Monthly score cards — send to parents via WhatsApp (click-to-chat)."
      />

      <Card className="flex items-center justify-between p-5">
        <div className="text-sm text-slate-600">
          Generate score cards for <strong>{monthLabel(new Date().toISOString())}</strong> from this
          month&apos;s marks, attendance and rewards.
        </div>
        <form action={generateScorecards}>
          <SubmitButton pendingText="Generating…">Generate this month</SubmitButton>
        </form>
      </Card>

      {cards && cards.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Student</Th><Th>Period</Th><Th>Avg score</Th><Th>Attendance</Th>
              <Th>Points</Th><Th>Status</Th><Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c: any) => {
              const s = c.summary ?? {};
              const parent = c.students?.parent;
              const text =
                `🏸 ${monthLabel(c.period_month)} score card for ${c.students?.full_name ?? "your child"}\n` +
                `• Avg skill score: ${s.avg_score != null ? Number(s.avg_score).toFixed(1) : "—"}\n` +
                `• Attendance: ${s.attendance_pct != null ? s.attendance_pct + "%" : "—"}\n` +
                `• Reward points: ${s.reward_points ?? 0}\n` +
                `View full card: ${baseUrl}/parent/scorecards`;
              const waUrl = waLink(parent?.phone, text);
              return (
                <tr key={c.id}>
                  <Td className="font-medium text-slate-900">{c.students?.full_name ?? "—"}</Td>
                  <Td>{monthLabel(c.period_month)}</Td>
                  <Td>{s.avg_score != null ? Number(s.avg_score).toFixed(1) : "—"}</Td>
                  <Td>{s.attendance_pct != null ? `${s.attendance_pct}%` : "—"}</Td>
                  <Td>{s.reward_points ?? 0}</Td>
                  <Td>
                    <Badge tone={c.status === "sent" ? "green" : c.status === "generated" ? "blue" : "slate"}>
                      {c.status}
                    </Badge>
                    {c.status === "sent" && c.generated_at && (
                      <span className="ml-1 text-xs text-slate-400">{formatDateTime(c.generated_at)}</span>
                    )}
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
      ) : (
        <EmptyState message="No score cards yet. Generate this month's cards above." />
      )}
    </div>
  );
}
