import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getViewBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Section, Badge, EmptyState, Select, cn } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatTime } from "@/lib/format";
import { approveLeave, declineLeave, assignMakeup, decideCoachLeave } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "green" | "yellow" | "red"> = {
  approved: "green", pending: "yellow", declined: "red",
};

export default async function LeavePage() {
  const me = await requireRole("admin");
  const supabase = await createClient();
  const bf = await getViewBranchId(me);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  // Student leave — pending first, then the recent decided tail.
  let lq = supabase
    .from("leave_requests")
    .select(`
      id, status, reason, created_at, makeup_session_id, attachment_path,
      students(id, full_name),
      parent:profiles!leave_requests_parent_id_fkey(full_name),
      session:sessions!leave_requests_session_id_fkey(id, session_date, start_time, branch_id, classes(name)),
      makeup:sessions!leave_requests_makeup_session_id_fkey(session_date, start_time, classes(name))
    `)
    .order("created_at", { ascending: false })
    .limit(100);
  const [{ data: leavesRaw }, { data: coachLeavesRaw }, mkQ] = await Promise.all([
    lq,
    supabase
      .from("coach_leave_requests")
      .select("id, status, reason, created_at, coach:profiles!coach_leave_requests_coach_id_fkey(full_name), sessions(id, session_date, start_time, branch_id, classes(name))")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sessions")
      .select("id, session_date, start_time, branch_id, classes(name)")
      .gte("session_date", today)
      .neq("status", "canceled")
      .order("session_date")
      .order("start_time")
      .limit(120),
  ]);

  // Branch focus (super-admin) — filter by the source session's branch.
  const leaves = ((leavesRaw ?? []) as any[]).filter((l) => !bf || l.session?.branch_id === bf);
  const coachLeaves = ((coachLeavesRaw ?? []) as any[]).filter((l) => !bf || l.sessions?.branch_id === bf);
  const makeupOptions = ((mkQ.data ?? []) as any[]).filter((s) => !bf || s.branch_id === bf);

  const pending = leaves.filter((l) => l.status === "pending");
  const decided = leaves.filter((l) => l.status !== "pending").slice(0, 20);

  // Signed URLs for any attachments on pending requests (private bucket).
  const admin = createAdminClient();
  const signed = new Map<string, string>();
  for (const l of pending) {
    if (l.attachment_path) {
      const { data } = await admin.storage.from("leave-docs").createSignedUrl(l.attachment_path, 3600);
      if (data?.signedUrl) signed.set(l.id, data.signedUrl);
    }
  }
  const coachPending = coachLeaves.filter((l) => l.status === "pending");
  const coachDecided = coachLeaves.filter((l) => l.status !== "pending").slice(0, 10);

  const mkLabel = (s: any) =>
    `${s.classes?.name ?? "Class"} — ${formatDate(s.session_date)} ${formatTime(s.start_time)}`;

  const MakeupSelect = ({ name }: { name: string }) => (
    <Select name={name} defaultValue="" className="h-9 w-64">
      <option value="">No makeup (excuse only)</option>
      {makeupOptions.map((s) => (
        <option key={s.id} value={s.id}>{mkLabel(s)}</option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave & Makeup"
        description="Parent leave requests, coach leave, and makeup class bookings. Approving a leave marks the student excused."
      />

      <Section title={`Pending student leave (${pending.length})`} flush>
        {pending.length ? (
          <ul className="divide-y divide-slate-100">
            {pending.map((l) => (
              <li key={l.id} className="space-y-2.5 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/students/${l.students?.id}`} className="font-semibold text-slate-900 hover:text-green-700 hover:underline">
                    {l.students?.full_name ?? "—"}
                  </Link>
                  <span className="text-sm text-slate-500">
                    {l.session?.classes?.name ?? "—"} · {formatDate(l.session?.session_date)} {formatTime(l.session?.start_time)}
                  </span>
                  {l.parent?.full_name && <span className="text-xs text-slate-400">by {l.parent.full_name}</span>}
                </div>
                {l.reason && <div className="text-sm text-slate-600">“{l.reason}”</div>}
                {signed.get(l.id) && (
                  <a href={signed.get(l.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
                    📎 View attachment
                  </a>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <form action={approveLeave} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">Makeup class (optional)</span>
                      <MakeupSelect name="makeup_session_id" />
                    </label>
                    <SubmitButton pendingText="Approving…">Approve</SubmitButton>
                  </form>
                  <form action={declineLeave}>
                    <input type="hidden" name="id" value={l.id} />
                    <SubmitButton variant="secondary" pendingText="…">Decline</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message="No pending leave requests." /></div>
        )}
      </Section>

      <Section title={`Pending coach leave (${coachPending.length})`} flush>
        {coachPending.length ? (
          <ul className="divide-y divide-slate-100">
            {coachPending.map((l) => (
              <li key={l.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{l.coach?.full_name ?? "Coach"}</span>
                  <span className="text-sm text-slate-500">
                    {l.sessions?.classes?.name ?? "—"} · {formatDate(l.sessions?.session_date)} {formatTime(l.sessions?.start_time)}
                  </span>
                </div>
                {l.reason && <div className="text-sm text-slate-600">“{l.reason}”</div>}
                <div className="flex flex-wrap gap-2">
                  <form action={decideCoachLeave}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <SubmitButton pendingText="…">Approve</SubmitButton>
                  </form>
                  <form action={decideCoachLeave}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="decision" value="declined" />
                    <SubmitButton variant="secondary" pendingText="…">Decline</SubmitButton>
                  </form>
                  {l.sessions?.id && (
                    <Link
                      href={`/admin/attendance/${l.sessions.id}`}
                      className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Session →
                    </Link>
                  )}
                </div>
                <p className="text-xs text-slate-400">Approving records the leave — then cancel the session or assign a cover coach on the class page.</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message="No pending coach leave." /></div>
        )}
      </Section>

      {(decided.length > 0 || coachDecided.length > 0) && (
        <Section title="Recently decided" flush>
          <ul className="divide-y divide-slate-100">
            {decided.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                <Badge tone={TONE[l.status] ?? "yellow"}>{l.status}</Badge>
                <span className="font-medium text-slate-900">{l.students?.full_name ?? "—"}</span>
                <span className="text-sm text-slate-500">
                  {l.session?.classes?.name ?? "—"} · {formatDate(l.session?.session_date)} {formatTime(l.session?.start_time)}
                </span>
                {l.status === "approved" && (
                  <span className={cn("text-sm", l.makeup ? "text-emerald-700" : "text-slate-400")}>
                    {l.makeup
                      ? `Makeup: ${l.makeup.classes?.name ?? "class"} ${formatDate(l.makeup.session_date)} ${formatTime(l.makeup.start_time)}`
                      : "no makeup"}
                  </span>
                )}
                {l.status === "approved" && (
                  <form action={assignMakeup} className="ml-auto flex items-center gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <MakeupSelect name="makeup_session_id" />
                    <SubmitButton variant="secondary" pendingText="…">Set makeup</SubmitButton>
                  </form>
                )}
              </li>
            ))}
            {coachDecided.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                <Badge tone={TONE[l.status] ?? "yellow"}>{l.status}</Badge>
                <span className="font-medium text-slate-900">{l.coach?.full_name ?? "Coach"}</span>
                <span className="text-sm text-slate-500">
                  coach leave · {l.sessions?.classes?.name ?? "—"} · {formatDate(l.sessions?.session_date)} {formatTime(l.sessions?.start_time)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
