import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Badge, Table, Th, Td, EmptyState, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { AnnounceComposer } from "@/components/announce-composer";
import { logAnnouncement, postCommunityMessage } from "./actions";

export const dynamic = "force-dynamic";

export default async function AnnouncePage({
  searchParams,
}: {
  searchParams: Promise<{ posted?: string; error?: string }>;
}) {
  const { posted, error } = await searchParams;
  const botReady = !!env.waCommunityGroupId;
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
        description="Blast one message to the whole parent WhatsApp Community at once — sent immediately. Great for holiday greetings, schedule changes, reminders."
      />

      {posted === "1" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ✅ Sent to the whole parent Community now.
        </div>
      )}
      {posted === "queued" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Worker offline — your message is queued and will post to the Community the moment the worker reconnects.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {botReady ? (
        <Section title="New announcement">
          <form action={postCommunityMessage} className="space-y-3">
            <Textarea
              name="text"
              rows={4}
              required
              placeholder="e.g. 🎉 Happy holidays from HBA! No classes 25 Dec–1 Jan. See you in the new year!"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Goes to the whole parent Community — no private info (fees, scores, a child&apos;s name).
              </p>
              <SubmitButton pendingText="Posting…">Post to Community</SubmitButton>
            </div>
          </form>
        </Section>
      ) : (
        <Section title="New announcement">
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Auto-posting isn&apos;t configured (set <code>WA_COMMUNITY_GROUP_ID</code>). Until then, post by
            hand:
          </p>
          <AnnounceComposer action={logAnnouncement} communityLink={env.waCommunityLink || null} />
        </Section>
      )}

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
