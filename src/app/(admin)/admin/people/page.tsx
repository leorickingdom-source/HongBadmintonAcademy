import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, cn } from "@/components/ui";
import { FilterSelect, FilterSearch } from "@/components/filter-controls";
import { CLASS_RANKS } from "@/lib/ranks";
import { dict } from "@/lib/i18n";
import { StudentsList } from "../students/students-list";
import { PeopleList } from "../_people/people-list";
import { deleteStudents } from "../students/actions";
import { deletePerson, deletePeople } from "../_people/actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "students", label: "Students" },
  { key: "parents", label: "Parents" },
  { key: "coaches", label: "Coaches" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    status?: string;
    rank?: string;
    coach?: string;
    branch?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const { tab, q, status, rank, coach, branch, sort, dir, page } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const isSuper = me.role === "super_admin";
  const active: Tab = TABS.some((t) => t.key === tab) ? (tab as Tab) : "students";
  const tabLabel: Record<string, string> = {
    students: L.dir_students,
    parents: L.dir_parents,
    coaches: L.dir_coaches,
  };

  const supabase = await createClient();
  const [{ data: coaches }, { data: branches }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
    supabase.from("branches").select("id, name").order("name"),
  ]);

  const statusFilter = status === "active" || status === "inactive" ? status : "";
  const rankFilter = rank && (CLASS_RANKS as readonly string[]).includes(rank) ? rank : "";
  const coachFilter = coach && (coaches ?? []).some((c) => c.id === coach) ? coach : "";
  const branchFilter = branch && (branches ?? []).some((b: any) => b.id === branch) ? branch : "";
  const filtered = Boolean((q ?? "").trim() || statusFilter || rankFilter || coachFilter || branchFilter);
  const dirParam: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);

  const newButton =
    active === "students" ? (
      <LinkButton href="/admin/students/new">{L.dir_new_student}</LinkButton>
    ) : active === "parents" ? (
      <LinkButton href="/admin/parents/new">{L.dir_new_parent}</LinkButton>
    ) : isSuper ? (
      // Coaches are staff → only a super-admin can create them.
      <LinkButton href="/admin/coaches/new">{L.dir_new_coach}</LinkButton>
    ) : null;

  return (
    <div>
      <PageHeader
        title={L.dir_title}
        description={L.dir_desc}
        action={
          <>
            {active === "coaches" && (
              <LinkButton href="/admin/coaches/summary" variant="secondary">💰 {L.dir_payroll_att}</LinkButton>
            )}
            {active === "students" && (
              <LinkButton href="/admin/leaderboard" variant="secondary">🏆 {L.dir_leaderboard}</LinkButton>
            )}
            {newButton}
          </>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={`/admin/people?tab=${t.key}`}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                on
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {tabLabel[t.key] ?? t.label}
            </Link>
          );
        })}
      </div>

      {/* Filters (auto-apply, soft navigation). The active tab is preserved via the URL. */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">{L.adm_search}</span>
          <FilterSearch name="q" defaultValue={q ?? ""} placeholder={L.dir_name_ph} className="h-9 w-48" />
        </label>
        {active === "students" && (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">{L.level_word}</span>
              <FilterSelect name="rank" defaultValue={rankFilter} className="h-9 w-44">
                <option value="">{L.cls_all_levels}</option>
                {CLASS_RANKS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </FilterSelect>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">{L.col_status}</span>
              <FilterSelect name="status" defaultValue={statusFilter} className="h-9 w-36">
                <option value="">{L.filter_all}</option>
                <option value="active">{L.adm_active}</option>
                <option value="inactive">{L.adm_inactive}</option>
              </FilterSelect>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">{L.dir_assigned_coach}</span>
              <FilterSelect name="coach" defaultValue={coachFilter} className="h-9 w-44">
                <option value="">{L.adm_all_coaches}</option>
                {(coaches ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name ?? c.id}</option>
                ))}
              </FilterSelect>
            </label>
            {(branches ?? []).length > 1 && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">{L.branch}</span>
                <FilterSelect name="branch" defaultValue={branchFilter} className="h-9 w-44">
                  <option value="">{L.dir_all_branches}</option>
                  {(branches ?? []).map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </FilterSelect>
              </label>
            )}
          </>
        )}
        {filtered && <LinkButton href={`/admin/people?tab=${active}`} variant="ghost">{L.clear_word}</LinkButton>}
      </div>

      {active === "students" && (
        <StudentsList
          q={q}
          status={statusFilter}
          rank={rankFilter}
          coach={coachFilter}
          branch={branchFilter}
          sort={(sort as any) ?? undefined}
          dir={dirParam}
          page={pageNum}
        />
      )}
      {active === "parents" && (
        <PeopleList
          role="parent"
          embedded
          q={q}
          sort={(sort as any) ?? undefined}
          dir={dirParam}
          page={pageNum}
          deleteAction={deletePerson.bind(null, "parent")}
          deleteManyAction={deletePeople.bind(null, "parent")}
        />
      )}
      {active === "coaches" && (
        <PeopleList
          role="coach"
          embedded
          q={q}
          sort={(sort as any) ?? undefined}
          dir={dirParam}
          page={pageNum}
          deleteAction={deletePerson.bind(null, "coach")}
          deleteManyAction={deletePeople.bind(null, "coach")}
        />
      )}
    </div>
  );
}
