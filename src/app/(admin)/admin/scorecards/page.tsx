import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Table, Th, Td, Badge, EmptyState, Button, LinkButton } from "@/components/ui";
import { monthLabel, formatDateTime } from "@/lib/format";
import { generateScorecards, sendScorecard } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const supabase = await createClient();
  const { data: cards } = await supabase
    .from("scorecards")
    .select("*, students(full_name)")
    .order("period_month", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Score Cards"
        description="Monthly score cards and WhatsApp distribution to parents."
      />

      <Card className="flex items-center justify-between p-5">
        <div className="text-sm text-slate-600">
          Generate score cards for <strong>{monthLabel(new Date().toISOString())}</strong> from this
          month&apos;s marks, attendance and rewards.
        </div>
        <form action={generateScorecards}>
          <Button type="submit">Generate this month</Button>
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
                        <LinkButton
                          href={`/api/scorecards/${c.id}/pdf`}
                          target="_blank"
                          rel="noopener"
                          variant="secondary"
                        >
                          PDF
                        </LinkButton>
                      )}
                      <form action={sendScorecard}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="secondary">Send WhatsApp</Button>
                      </form>
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
