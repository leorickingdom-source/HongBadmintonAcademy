import { createClient } from "@/lib/supabase/server";
import {
  PageHeader,
  Section,
  Field,
  Textarea,
  Button,
  Badge,
  Table,
  Th,
  Td,
  EmptyState,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { isWaWorkerConfigured } from "@/lib/env";
import { postAnnouncement } from "./actions";

export const dynamic = "force-dynamic";

function Banner({ tone, children }: { tone: "green" | "red" | "yellow"; children: React.ReactNode }) {
  const styles = {
    green: "bg-green-50 text-green-700 ring-green-600/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
    yellow: "bg-amber-50 text-amber-700 ring-amber-600/20",
  }[tone];
  return (
    <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${styles}`}>{children}</div>
  );
}

export default async function AnnouncePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const configured = isWaWorkerConfigured();

  const supabase = await createClient();
  const { data: history } = await supabase
    .from("messages")
    .select("id, body, status, error, created_at")
    .eq("type", "custom")
    .eq("provider", "wwebjs")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Post one notice to the parent WhatsApp Community — every parent sees it. No per-parent blast, no ban risk."
      />

      {sp.sent && <Banner tone="green">Announcement posted to the community.</Banner>}
      {sp.error && <Banner tone="red">{sp.error}</Banner>}
      {!configured && (
        <Banner tone="yellow">
          WhatsApp worker not configured. Set <code>WA_WORKER_URL</code>,{" "}
          <code>WA_WORKER_SECRET</code> and <code>WA_COMMUNITY_GROUP_ID</code> — see{" "}
          <code>wa-worker/README.md</code>.
        </Banner>
      )}

      <Section title="New announcement">
        <form action={postAnnouncement} className="space-y-4">
          <Field
            label="Message"
            hint="Goes to the community Announcements group. Don't put private info (fees, scores, a child's name) here — every parent can read it."
          >
            <Textarea
              name="text"
              rows={5}
              required
              placeholder="e.g. No class this Saturday 14 June (public holiday). Normal schedule resumes Monday. Bring a water bottle 🏸"
            />
          </Field>
          <Button type="submit" disabled={!configured}>
            Post to community
          </Button>
        </form>
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
                    <Badge tone={m.status === "sent" ? "green" : "red"}>{m.status}</Badge>
                    {m.error && <div className="mt-1 text-xs text-red-600">{m.error}</div>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState message="No announcements yet." />
          </div>
        )}
      </Section>
    </div>
  );
}
