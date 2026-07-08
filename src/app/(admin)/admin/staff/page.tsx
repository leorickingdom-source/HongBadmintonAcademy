import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PageHeader, Section, Badge, EmptyState, LinkButton, Avatar } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { ROLE_LABEL } from "@/lib/constants";
import { dict, roleLabel } from "@/lib/i18n";
import { deletePerson } from "../_people/actions";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const me = await requireSuperAdmin();
  const L = dict(me.locale);
  const supabase = await createClient();

  const [{ data: admins }, { data: branches }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, branch_id")
      .in("role", ["admin", "super_admin"])
      .order("role")
      .order("full_name"),
    supabase.from("branches").select("id, name"),
  ]);
  const branchName = new Map((branches ?? []).map((b: any) => [b.id, b.name as string]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.st_title}
        description={L.st_desc}
        action={<LinkButton href="/admin/staff/new">{L.st_new}</LinkButton>}
      />

      <Section title={`${L.st_admins_section} (${admins?.length ?? 0})`} flush>
        {admins && admins.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {admins.map((a: any) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={a.full_name ?? a.email ?? "?"} size={36} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{a.full_name ?? "—"}</span>
                      <Badge tone={a.role === "super_admin" ? "green" : "blue"}>{roleLabel(me.locale, a.role, ROLE_LABEL[a.role] ?? a.role)}</Badge>
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {a.email ?? "—"}
                      {a.role !== "super_admin" && ` · ${a.branch_id ? branchName.get(a.branch_id) ?? "—" : L.st_no_branch}`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/admin/staff/${a.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">{L.edit_btn}</Link>
                  {a.id !== me.id && (
                    <form action={deletePerson.bind(null, a.role as Role)}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmButton label={L.del_word} confirmText={L.st_del_confirm.replace("{name}", a.full_name ?? a.email)} />
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message={L.st_empty} /></div>
        )}
      </Section>

      <p className="text-sm text-slate-500">
        {L.st_footer_pre}<LinkButton href="/admin/people?tab=coaches" variant="ghost">{L.dir_title}</LinkButton>{L.st_footer_post}
      </p>
    </div>
  );
}
