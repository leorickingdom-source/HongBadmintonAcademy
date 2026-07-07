import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Badge, Table, Th, Td, EmptyState, Textarea, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { AnnounceComposer } from "@/components/announce-composer";
import { getCommunityIntro } from "@/lib/settings";
import { getProfile } from "@/lib/auth";
import { logAnnouncement, postCommunityMessage, saveCommunityIntro, inviteParentsToCommunity } from "./actions";

export const dynamic = "force-dynamic";

export default async function AnnouncePage({
  searchParams,
}: {
  searchParams: Promise<{ posted?: string; error?: string; intro?: string; invited?: string; parents?: string }>;
}) {
  const { posted, error, intro: introSaved, invited, parents } = await searchParams;
  const botReady = !!env.waCommunityGroupId;
  const me = await getProfile();
  const isSuper = me?.role === "super_admin";
  const intro = await getCommunityIntro();
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
      {introSaved === "saved" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">Monthly note saved.</div>
      )}
      {introSaved === "cleared" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Monthly note cleared.</div>
      )}
      {invited !== undefined && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ✅ Invite sent — pushed to {invited} of {parents ?? "?"} parents. The rest have push off; they&apos;ll see it in the app.
        </div>
      )}

      {/* Super-admin only: push all parents an invite to the WhatsApp group. */}
      {isSuper && env.waCommunityLink && (
        <Section
          title="Invite parents to the WhatsApp group"
          description="Sends a one-tap push to every parent — it lands on their phone (even if they never open the app) and the tap opens the WhatsApp group invite. Zero ban risk (push, not a WhatsApp DM)."
        >
          <form>
            <button type="submit" formAction={inviteParentsToCommunity} className={buttonClass("primary")}>
              📢 Push invite to all parents
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Send <b>sparingly</b> — we can&apos;t tell who already joined, so this goes to every parent each time. Once is usually enough; re-send only when you have a batch of new families.
            </p>
          </form>
        </Section>
      )}
      {isSuper && !env.waCommunityLink && (
        <Section title="Invite parents to the WhatsApp group">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Set <code>WA_COMMUNITY_LINK</code> in Vercel (your <code>chat.whatsapp.com/…</code> invite) to enable the one-tap parent invite.
          </p>
        </Section>
      )}

      {botReady ? (
        <Section
          title="Message the parent Community"
          description="One WhatsApp message to all parents. No private info (fees, scores, a child's name)."
        >
          <form className="space-y-3">
            <Textarea name="text" rows={4} placeholder="Type a message…" />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" formAction={postCommunityMessage} className={buttonClass("primary")}>Send now</button>
              <button type="submit" formAction={saveCommunityIntro} className={buttonClass("secondary")}>Save as monthly note</button>
            </div>
            <p className="text-xs text-slate-500">
              <b>Send now</b> — posts immediately to everyone. <b>Save as monthly note</b> — added automatically to next
              month&apos;s Growth-Reports &amp; fees post (not sent now); save with the box empty to clear it.
            </p>
          </form>
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
            {intro ? (
              <span className="text-slate-600">📌 Monthly note: <span className="text-slate-900">&ldquo;{intro}&rdquo;</span></span>
            ) : (
              <span className="text-slate-400">No monthly note set — the auto post sends the summary only.</span>
            )}
          </div>
        </Section>
      ) : (
        <Section title="Message the parent Community">
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Auto-posting isn&apos;t configured (set <code>WA_COMMUNITY_GROUP_ID</code>). Until then, post by hand:
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
                  <Td label="Message" className="max-w-lg whitespace-pre-wrap text-slate-700">{m.body}</Td>
                  <Td label="Status">
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
