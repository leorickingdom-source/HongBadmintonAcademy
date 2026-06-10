import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { AnnounceComposer } from "@/components/announce-composer";
import { logAnnouncement } from "./actions";

export const dynamic = "force-dynamic";

export default async function AnnouncePage() {
  const supabase = await createClient();
  const { data: history } = await supabase
    .from("messages")
    .select("id, body, status, created_at")
    .eq("type", "custom")
    .eq("recipient_phone", "community")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Compose a notice, then post it once in the parent WhatsApp Community — every parent sees it. No bot, no blast, no ban risk."
      />

      <Section title="New announcement">
        <AnnounceComposer action={logAnnouncement} communityLink={env.waCommunityLink || null} />
      </Section>

      <Section title={`Recent announcements (${history?.length ?? 0})`} flush>
        {history && history.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Message</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((m: any) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-slate-500">{formatDateTime(m.created_at)}</Td>
                  <Td className="max-w-lg whitespace-pre-wrap text-slate-700">{m.body}</Td>
                  <Td>
                    <Badge tone="green">{m.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState message="No announcements logged yet." />
          </div>
        )}
      </Section>
    </div>
  );
}
