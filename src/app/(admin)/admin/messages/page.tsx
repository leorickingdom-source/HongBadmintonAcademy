import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { MessageStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TONE: Record<MessageStatus, "green" | "blue" | "yellow" | "red" | "slate"> = {
  queued: "slate", sent: "blue", delivered: "green", read: "green", failed: "red",
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <PageHeader
        title="WhatsApp Log"
        description="Score cards and payment reminders — delivery status tracking."
      />

      {messages && messages.length > 0 ? (
        <Section title={`Messages (${messages.length})`} flush>
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
        </Section>
      ) : (
        <EmptyState message="No messages sent yet." />
      )}
    </div>
  );
}
