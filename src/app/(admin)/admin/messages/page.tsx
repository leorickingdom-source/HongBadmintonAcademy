import { CircleCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Collapsible, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { MessageStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TONE: Record<MessageStatus, "green" | "blue" | "yellow" | "red" | "slate"> = {
  queued: "slate", sent: "blue", delivered: "green", read: "green", failed: "red",
};

// Friendly labels for message_queue.kind values.
const KIND_LABEL: Record<string, string> = {
  before_due: "Fee — before due",
  due_day: "Fee — due today",
  session_canceled: "Session cancelled",
};
function kindLabel(k: string): string {
  return KIND_LABEL[k] ?? (k.startsWith("overdue_") ? `Fee — overdue ${k.slice(8)}d` : k);
}

export default async function MessagesPage() {
  const supabase = await createClient();
  // The pending queue lives in message_queue (server-only RLS) — read it with the
  // service-role client; the sent/failed log lives in messages.
  const admin = createAdminClient();

  const [{ data: queued }, { data: messages }] = await Promise.all([
    admin
      .from("message_queue")
      .select("*")
      .in("status", ["queued", "sending"])
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp" description="What's waiting to send, and the delivery log." />

      <Collapsible title="Queued — waiting to send" count={queued?.length ?? 0}>
        {queued && queued.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Queued</Th><Th>Type</Th><Th>To</Th><Th>Message</Th></tr>
            </thead>
            <tbody>
              {queued.map((m: any) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="text-slate-500">{formatDateTime(m.created_at)}</Td>
                  <Td><Badge tone="slate">{kindLabel(m.kind)}</Badge></Td>
                  <Td className="font-mono text-xs text-slate-500">{m.recipient_phone}</Td>
                  <Td className="max-w-md truncate text-xs text-slate-500" title={m.body ?? ""}>{m.body}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState icon={<CircleCheck className="h-5 w-5 text-green-500" />} message="All caught up" hint="Nothing queued to send." /></div>
        )}
      </Collapsible>

      <Collapsible title="Sent / delivery log" count={messages?.length ?? 0}>
        {messages && messages.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>When</Th><Th>Type</Th><Th>To</Th><Th>Status</Th><Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m: any) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="text-slate-500">{formatDateTime(m.created_at)}</Td>
                  <Td><Badge tone="slate">{m.type}</Badge></Td>
                  <Td className="font-mono text-xs text-slate-500">{m.recipient_phone}</Td>
                  <Td><Badge tone={TONE[m.status as MessageStatus]}>{m.status}</Badge></Td>
                  <Td className="max-w-md truncate text-xs text-slate-500" title={m.error ?? m.body ?? ""}>
                    {m.error ? <span className="text-red-600">{m.error}</span> : m.body}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No messages sent yet." /></div>
        )}
      </Collapsible>
    </div>
  );
}
