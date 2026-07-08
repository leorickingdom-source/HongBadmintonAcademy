import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listBranches } from "@/lib/branch";
import { PageHeader, LinkButton, Card, Badge, Select, Button, Input, EmptyState, cn } from "@/components/ui";
import { waLink } from "@/lib/wa";
import { levelName } from "@/lib/training";
import { dict } from "@/lib/i18n";
import { updateLeadStatus, assignLead, addLeadNote, convertLead } from "./actions";

export const dynamic = "force-dynamic";

type Lead = {
  id: string;
  branch_id: string | null;
  child_name: string;
  child_dob: string | null;
  experience: string | null;
  parent_name: string;
  phone: string | null;
  email: string | null;
  preferred_slot: string | null;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  converted_student_id: string | null;
  created_at: string;
};

const STATUSES = ["new", "contacted", "trial_booked", "trialed", "enrolled", "lost"] as const;
const STATUS_TONE: Record<string, "blue" | "yellow" | "green" | "slate"> = {
  new: "blue",
  contacted: "yellow",
  trial_booked: "yellow",
  trialed: "green",
  enrolled: "green",
  lost: "slate",
};

function ageFromDob(dob: string | null, suffix: string): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 100 ? `${age} ${suffix}` : null;
}

// A gentle starting-level default from the self-reported experience; the admin
// can override it in the Convert dropdown.
function suggestLevel(experience: string | null): number {
  return experience === "experienced" ? 3 : experience === "some" ? 2 : 1;
}

function fmtMYT(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const active = (STATUSES as readonly string[]).includes(status ?? "") ? status! : "all";

  const statusLabel: Record<string, string> = {
    new: L.lead_st_new,
    contacted: L.lead_st_contacted,
    trial_booked: L.lead_st_trial_booked,
    trialed: L.lead_st_trialed,
    enrolled: L.lead_st_enrolled,
    lost: L.lead_st_lost,
  };
  const expLabel: Record<string, string> = {
    none: L.exp_none,
    some: L.exp_some,
    experienced: L.exp_experienced,
  };

  const db = await createClient();
  const [{ data: leadsRaw }, { data: admins }, branches] = await Promise.all([
    db
      .from("trial_leads")
      .select("id, branch_id, child_name, child_dob, experience, parent_name, phone, email, preferred_slot, status, assigned_to, notes, converted_student_id, created_at")
      .order("created_at", { ascending: false }),
    db.from("profiles").select("id, full_name").in("role", ["admin", "super_admin"]).order("full_name"),
    listBranches(false),
  ]);

  const leads = (leadsRaw ?? []) as Lead[];
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const adminName = new Map((admins ?? []).map((a) => [a.id, a.full_name ?? L.adm_admin]));

  const counts: Record<string, number> = { all: leads.length };
  for (const s of STATUSES) counts[s] = 0;
  for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;

  const shown = active === "all" ? leads : leads.filter((l) => l.status === active);

  const tabs = [{ key: "all", label: L.filter_all }, ...STATUSES.map((s) => ({ key: s, label: statusLabel[s] }))];

  return (
    <div>
      <PageHeader
        title={L.lead_title}
        description={L.lead_desc}
        action={<LinkButton href="/trial" variant="secondary" target="_blank" rel="noopener">↗ {L.lead_public_form}</LinkButton>}
      />

      {/* Status filter tabs with live counts */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <a
              key={t.key}
              href={t.key === "all" ? "/admin/leads" : `/admin/leads?status=${t.key}`}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                on ? "border-green-600 text-green-700" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-slate-400">{counts[t.key] ?? 0}</span>
            </a>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          message={active === "all" ? L.lead_empty : `${L.lead_none_in}“${statusLabel[active] ?? active}”`}
          hint={L.lead_empty_hint}
        />
      ) : (
        <div className="space-y-3">
          {shown.map((l) => {
            const age = ageFromDob(l.child_dob, L.yrs_suffix);
            const exp = l.experience ? expLabel[l.experience] ?? l.experience : null;
            const wa = l.phone ? waLink(l.phone, L.lead_wa_msg.replace("{name}", l.parent_name)) : null;
            return (
              <Card key={l.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{l.child_name}</span>
                      <Badge tone={STATUS_TONE[l.status] ?? "slate"}>{statusLabel[l.status] ?? l.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {[age, exp, l.branch_id ? branchName.get(l.branch_id) : null].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <div className="mt-1.5 text-sm text-slate-700">
                      {l.parent_name}
                      {l.phone && (
                        <>
                          {" · "}
                          {wa ? (
                            <a href={wa} target="_blank" rel="noopener" className="font-medium text-emerald-700 hover:underline">{l.phone}</a>
                          ) : (
                            l.phone
                          )}
                        </>
                      )}
                      {l.email && <> · <a href={`mailto:${l.email}`} className="text-slate-600 hover:underline">{l.email}</a></>}
                    </div>
                    {l.preferred_slot && <div className="mt-0.5 text-xs text-slate-500">{L.lead_prefers}{l.preferred_slot}</div>}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>{fmtMYT(l.created_at)}</div>
                    <div className="mt-0.5">{l.assigned_to ? `→ ${adminName.get(l.assigned_to) ?? L.adm_admin}` : L.lead_unassigned}</div>
                  </div>
                </div>

                {l.notes && (
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">{l.notes}</pre>
                )}

                {/* Controls: status · assign · add note (all server-action forms) */}
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                  <form action={updateLeadStatus} className="flex items-end gap-1.5">
                    <input type="hidden" name="id" value={l.id} />
                    <Select name="status" defaultValue={l.status} className="h-9 w-36">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{statusLabel[s]}</option>
                      ))}
                    </Select>
                    <Button type="submit" variant="secondary" className="h-9">{L.update_btn}</Button>
                  </form>

                  <form action={assignLead} className="flex items-end gap-1.5">
                    <input type="hidden" name="id" value={l.id} />
                    <Select name="assigned_to" defaultValue={l.assigned_to ?? ""} className="h-9 w-40">
                      <option value="">{L.lead_unassigned}</option>
                      {(admins ?? []).map((a) => (
                        <option key={a.id} value={a.id}>{a.full_name ?? L.adm_admin}</option>
                      ))}
                    </Select>
                    <Button type="submit" variant="secondary" className="h-9">{L.lead_assign_btn}</Button>
                  </form>

                  <form action={addLeadNote} className="flex flex-1 items-end gap-1.5">
                    <input type="hidden" name="id" value={l.id} />
                    <Input name="note" placeholder={L.lead_note_ph} className="h-9 min-w-40 flex-1" />
                    <Button type="submit" variant="ghost" className="h-9">{L.lead_add_note_btn}</Button>
                  </form>
                </div>

                {/* Convert → real student (Phase 2), or a link once enrolled */}
                {l.converted_student_id ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
                    <Badge tone="green">{L.lead_st_enrolled}</Badge>
                    <LinkButton href={`/admin/students/${l.converted_student_id}`} variant="ghost" className="h-8">{L.lead_view_student}</LinkButton>
                  </div>
                ) : (
                  <form action={convertLead} className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                    <input type="hidden" name="id" value={l.id} />
                    <label className="text-xs font-medium text-slate-600">
                      {L.lead_starting_level}
                      <Select name="level" defaultValue={String(suggestLevel(l.experience))} className="mt-1 h-9 w-48">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>{n} · {levelName(n)}</option>
                        ))}
                      </Select>
                    </label>
                    {l.email && (
                      <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
                        <input type="checkbox" name="create_parent" value="on" defaultChecked />
                        {L.lead_create_parent}
                      </label>
                    )}
                    <Button type="submit" className="h-9">{L.lead_convert_btn}</Button>
                  </form>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
