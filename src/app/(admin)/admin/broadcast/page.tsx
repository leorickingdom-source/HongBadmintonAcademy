import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton } from "@/components/ui";
import { BroadcastQueue, type BroadcastItem } from "@/components/broadcast-queue";
import { getBaseUrl } from "@/lib/url";
import { waLink } from "@/lib/wa";
import { feeReminderText } from "@/lib/reminder-text";
import { monthLabel } from "@/lib/format";
import { logScorecardSend } from "../scorecards/actions";
import { logReminderSend } from "../invoices/actions";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type === "reminders" ? "reminders" : "scorecards";
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  let items: BroadcastItem[] = [];
  let action: (formData: FormData) => void;
  let emptyLabel: string;

  if (type === "reminders") {
    action = logReminderSend;
    emptyLabel = "No unpaid invoices to remind about.";
    const { data } = await supabase
      .from("invoices")
      .select("id, amount, currency, due_date, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone, id)")
      .in("status", ["unpaid", "overdue"])
      .order("created_at", { ascending: false });
    items = (data ?? []).map((i: any) => {
      const phone = i.parent?.phone ?? null;
      const body = feeReminderText({
        parentName: i.parent?.full_name,
        studentName: i.students?.full_name,
        amount: i.amount,
        currency: i.currency,
        dueDate: i.due_date,
        payUrl: `${baseUrl}/parent/invoices`,
      });
      return {
        id: i.id,
        name: i.students?.full_name ?? i.parent?.full_name ?? "—",
        phone,
        waUrl: waLink(phone, body),
        body,
        fields: { invoice_id: i.id, recipient_phone: phone ?? "", recipient_profile_id: i.parent?.id ?? "", body },
      };
    });
  } else {
    action = logScorecardSend;
    emptyLabel = "No score cards waiting to be sent. Generate them first.";
    const { data } = await supabase
      .from("scorecards")
      .select("id, period_month, summary, status, students(full_name, parent:profiles!students_parent_id_fkey(full_name, phone, id))")
      .neq("status", "sent")
      .order("period_month", { ascending: false });
    items = (data ?? []).map((c: any) => {
      const s = c.summary ?? {};
      const parent = c.students?.parent;
      const phone = parent?.phone ?? null;
      const body =
        `🏸 ${monthLabel(c.period_month)} score card for ${c.students?.full_name ?? "your child"}\n` +
        `• Avg skill score: ${s.avg_score != null ? Number(s.avg_score).toFixed(1) : "—"}\n` +
        `• Attendance: ${s.attendance_pct != null ? s.attendance_pct + "%" : "—"}\n` +
        `• Reward points: ${s.reward_points ?? 0}\n` +
        `View full card: ${baseUrl}/parent/scorecards`;
      return {
        id: c.id,
        name: c.students?.full_name ?? "—",
        phone,
        waUrl: waLink(phone, body),
        body,
        fields: { scorecard_id: c.id, recipient_phone: phone ?? "", recipient_profile_id: parent?.id ?? "", body },
      };
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broadcast"
        description="Send WhatsApp to every parent — tap Send next, hit send in WhatsApp, repeat. Your own number, no Meta."
      />

      <div className="flex gap-2">
        <LinkButton
          href="/admin/broadcast?type=scorecards"
          variant={type === "scorecards" ? "primary" : "secondary"}
        >
          Score cards
        </LinkButton>
        <LinkButton
          href="/admin/broadcast?type=reminders"
          variant={type === "reminders" ? "primary" : "secondary"}
        >
          Payment reminders
        </LinkButton>
      </div>

      <BroadcastQueue items={items} action={action} emptyLabel={emptyLabel} />
    </div>
  );
}
