import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getViewBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Section, Badge, EmptyState, Select, cn } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { approveLeave, declineLeave, assignMakeup, decideCoachLeave, confirmCoverOffer } from "./actions";
import { eligibleCoverCoaches, type EligibleCoach } from "@/lib/cover";

export const dynamic = "force-dynamic";

const TONE: Record<string, "green" | "yellow" | "red"> = {
  approved: "green", pending: "yellow", declined: "red",
};

export default async function LeavePage() {
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const supabase = await createClient();
  const bf = await getViewBranchId(me);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const stLabel: Record<string, string> = {
    approved: L.lv_st_approved,
    pending: L.lv_st_pending,
    declined: L.lv_st_declined,
  };

  // Student leave — pending first, then the recent decided tail.
  let lq = supabase
    .from("leave_requests")
    .select(`
      id, status, reason, created_at, makeup_session_id, proposed_makeup_session_id, attachment_path,
      students(id, full_name),
      parent:profiles!leave_requests_parent_id_fkey(full_name),
      session:sessions!leave_requests_session_id_fkey(id, session_date, start_time, branch_id, classes(name)),
      makeup:sessions!leave_requests_makeup_session_id_fkey(session_date, start_time, classes(name)),
      proposed:sessions!leave_requests_proposed_makeup_session_id_fkey(session_date, start_time, classes(name))
    `)
    .order("created_at", { ascending: false })
    .limit(100);
  const [{ data: leavesRaw }, { data: coachLeavesRaw }, mkQ] = await Promise.all([
    lq,
    supabase
      .from("coach_leave_requests")
      .select("id, status, reason, created_at, replacement_coach_id, cover_status, coach_id, coach:profiles!coach_leave_requests_coach_id_fkey(full_name), replacement:profiles!coach_leave_requests_replacement_coach_id_fkey(full_name), sessions(id, session_date, start_time, end_time, branch_id, classes(name))")
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
  const coachOpen = coachLeaves.filter((l) => l.status === "approved" && l.cover_status === "open");
  const coachDecided = coachLeaves
    .filter((l) => l.status !== "pending" && !(l.status === "approved" && l.cover_status === "open"))
    .slice(0, 10);

  // Free coaches for each pending coach-leave (filtered by that session's exact
  // date+time), so the admin never picks a coach who's already teaching then.
  const eligibleByLeave = new Map<string, EligibleCoach[]>();
  await Promise.all(
    coachPending.map(async (l) => {
      const ses = l.sessions;
      if (!ses) return;
      const list = await eligibleCoverCoaches({
        sessionId: ses.id,
        sessionDate: ses.session_date,
        startTime: ses.start_time,
        endTime: ses.end_time,
        branchId: ses.branch_id ?? null,
        onLeaveCoachId: l.coach_id,
      });
      eligibleByLeave.set(l.id, list);
    }),
  );

  // Pending offers on the open covers, grouped by leave.
  const offersByLeave = new Map<string, { id: string; coach_id: string; full_name: string | null }[]>();
  const openIds = coachOpen.map((l) => l.id);
  if (openIds.length) {
    const { data: offers } = await supabase
      .from("coach_cover_offers")
      .select("id, leave_id, coach_id, status, coach:profiles!coach_cover_offers_coach_id_fkey(full_name)")
      .in("leave_id", openIds)
      .eq("status", "offered")
      .order("created_at");
    for (const o of (offers ?? []) as any[]) {
      const arr = offersByLeave.get(o.leave_id) ?? [];
      arr.push({ id: o.id, coach_id: o.coach_id, full_name: o.coach?.full_name ?? null });
      offersByLeave.set(o.leave_id, arr);
    }
  }

  const mkLabel = (s: any) =>
    `${s.classes?.name ?? L.class_word} — ${formatDate(s.session_date)} ${formatTime(s.start_time)}`;

  const MakeupSelect = ({ name, defaultValue = "" }: { name: string; defaultValue?: string }) => (
    <Select name={name} defaultValue={defaultValue} className="h-9 w-64">
      <option value="">{L.lv_no_makeup_excuse}</option>
      {makeupOptions.map((s) => (
        <option key={s.id} value={s.id}>{mkLabel(s)}</option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.lv_title}
        description={L.lv_desc}
      />

      <Section title={`${L.lv_pending_student} (${pending.length})`} flush>
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
                  {l.parent?.full_name && <span className="text-xs text-slate-400">{L.lv_by}{l.parent.full_name}</span>}
                </div>
                {l.reason && <div className="text-sm text-slate-600">“{l.reason}”</div>}
                {signed.get(l.id) && (
                  <a href={signed.get(l.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
                    📎 {L.lv_view_attach}
                  </a>
                )}
                {l.proposed && (
                  <div className="text-sm text-emerald-700">
                    {L.lv_parent_requested}<span className="font-medium">{l.proposed.classes?.name ?? L.class_word} · {formatDate(l.proposed.session_date)} {formatTime(l.proposed.start_time)}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <form action={approveLeave} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">{l.proposed ? L.lv_makeup_confirm : L.lv_makeup_optional}</span>
                      <MakeupSelect name="makeup_session_id" defaultValue={l.proposed_makeup_session_id ?? ""} />
                    </label>
                    <SubmitButton pendingText={L.lv_approving}>{L.lv_approve}</SubmitButton>
                  </form>
                  <form action={declineLeave}>
                    <input type="hidden" name="id" value={l.id} />
                    <SubmitButton variant="secondary" pendingText="…">{L.lv_decline}</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message={L.lv_empty_student} /></div>
        )}
      </Section>

      <Section title={`${L.lv_pending_coach} (${coachPending.length})`} flush>
        {coachPending.length ? (
          <ul className="divide-y divide-slate-100">
            {coachPending.map((l) => (
              <li key={l.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{l.coach?.full_name ?? L.adm_coach}</span>
                  <span className="text-sm text-slate-500">
                    {l.sessions?.classes?.name ?? "—"} · {formatDate(l.sessions?.session_date)} {formatTime(l.sessions?.start_time)}
                  </span>
                </div>
                {l.reason && <div className="text-sm text-slate-600">“{l.reason}”</div>}
                {(() => {
                  const eligible = eligibleByLeave.get(l.id) ?? [];
                  return (
                    <>
                      <div className="flex flex-wrap items-end gap-2">
                        <form action={decideCoachLeave} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="decision" value="approved" />
                          <label className="block space-y-1">
                            <span className="text-xs font-medium text-slate-500">{L.lv_cover_coach}</span>
                            <Select name="replacement_coach_id" defaultValue="" className="h-9 w-56">
                              <option value="">{L.lv_no_cover}</option>
                              {eligible.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.full_name ?? "—"}{c.sessionsThatDay ? ` · ${c.sessionsThatDay}${L.lv_today_sessions_suffix}` : ""}{!c.sameBranch ? ` · ${L.lv_other_branch}` : ""}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <SubmitButton name="cover_mode" value="assign" pendingText="…">{L.lv_approve}</SubmitButton>
                        </form>
                        <form action={decideCoachLeave}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="decision" value="approved" />
                          <SubmitButton name="cover_mode" value="open" variant="secondary" pendingText="…">{L.lv_ask_coaches}</SubmitButton>
                        </form>
                        <form action={decideCoachLeave}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="decision" value="declined" />
                          <SubmitButton variant="ghost" pendingText="…">{L.lv_decline}</SubmitButton>
                        </form>
                        {l.sessions?.id && (
                          <Link
                            href={`/admin/attendance/${l.sessions.id}`}
                            className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                          >
                            {L.lv_session_arrow}
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {eligible.length === 0 ? L.lv_no_free_coach : `${eligible.length} ${L.lv_free_coaches} · ${L.lv_coach_note}`}
                      </p>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message={L.lv_empty_coach} /></div>
        )}
      </Section>

      {coachOpen.length > 0 && (
        <Section title={`${L.lv_seeking_cover} (${coachOpen.length})`} flush>
          <ul className="divide-y divide-slate-100">
            {coachOpen.map((l) => {
              const offers = offersByLeave.get(l.id) ?? [];
              return (
                <li key={l.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{L.lv_open_badge}</Badge>
                    <span className="font-semibold text-slate-900">{l.coach?.full_name ?? L.adm_coach}</span>
                    <span className="text-sm text-slate-500">
                      {l.sessions?.classes?.name ?? "—"} · {formatDate(l.sessions?.session_date)} {formatTime(l.sessions?.start_time)}
                    </span>
                  </div>
                  {offers.length === 0 ? (
                    <p className="text-sm text-slate-400">{L.lv_no_offers}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {offers.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{o.full_name ?? "—"}</span>
                          <span className="text-xs text-slate-400">{L.lv_offered}</span>
                          <form action={confirmCoverOffer} className="ml-auto">
                            <input type="hidden" name="offer_id" value={o.id} />
                            <SubmitButton pendingText="…">{L.lv_confirm_cover}</SubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(decided.length > 0 || coachDecided.length > 0) && (
        <Section title={L.lv_recent} flush>
          <ul className="divide-y divide-slate-100">
            {decided.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                <Badge tone={TONE[l.status] ?? "yellow"}>{stLabel[l.status] ?? l.status}</Badge>
                <span className="font-medium text-slate-900">{l.students?.full_name ?? "—"}</span>
                <span className="text-sm text-slate-500">
                  {l.session?.classes?.name ?? "—"} · {formatDate(l.session?.session_date)} {formatTime(l.session?.start_time)}
                </span>
                {l.status === "approved" && (
                  <span className={cn("text-sm", l.makeup ? "text-emerald-700" : "text-slate-400")}>
                    {l.makeup
                      ? `${L.lv_makeup_prefix}${l.makeup.classes?.name ?? L.class_word} ${formatDate(l.makeup.session_date)} ${formatTime(l.makeup.start_time)}`
                      : L.lv_no_makeup}
                  </span>
                )}
                {l.status === "approved" && (
                  <form action={assignMakeup} className="ml-auto flex items-center gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <MakeupSelect name="makeup_session_id" />
                    <SubmitButton variant="secondary" pendingText="…">{L.lv_set_makeup}</SubmitButton>
                  </form>
                )}
              </li>
            ))}
            {coachDecided.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                <Badge tone={TONE[l.status] ?? "yellow"}>{stLabel[l.status] ?? l.status}</Badge>
                <span className="font-medium text-slate-900">{l.coach?.full_name ?? L.adm_coach}</span>
                <span className="text-sm text-slate-500">
                  {L.lv_coach_leave_tag} · {l.sessions?.classes?.name ?? "—"} · {formatDate(l.sessions?.session_date)} {formatTime(l.sessions?.start_time)}
                </span>
                {l.status === "approved" && l.replacement?.full_name && (
                  <span className="text-sm text-emerald-700">{L.lv_cover_by}{l.replacement.full_name}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
