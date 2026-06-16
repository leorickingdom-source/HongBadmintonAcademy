import Link from "next/link";
import { PageHeader, LinkButton, cn } from "@/components/ui";
import { FilterSelect, FilterSearch } from "@/components/filter-controls";
import { CLASS_RANKS } from "@/lib/ranks";
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
  searchParams: Promise<{ tab?: string; q?: string; status?: string; rank?: string }>;
}) {
  const { tab, q, status, rank } = await searchParams;
  const active: Tab = TABS.some((t) => t.key === tab) ? (tab as Tab) : "students";

  const statusFilter = status === "active" || status === "inactive" ? status : "";
  const rankFilter = rank && (CLASS_RANKS as readonly string[]).includes(rank) ? rank : "";
  const filtered = Boolean((q ?? "").trim() || statusFilter || rankFilter);

  const newButton =
    active === "students" ? (
      <LinkButton href="/admin/students/new">+ New student</LinkButton>
    ) : active === "parents" ? (
      <LinkButton href="/admin/parents/new">+ New parent</LinkButton>
    ) : (
      <LinkButton href="/admin/coaches/new">+ New coach</LinkButton>
    );

  return (
    <div>
      <PageHeader
        title="Directory"
        description="Students, parents and coaches — all in one place."
        action={
          <>
            {active === "coaches" && (
              <LinkButton href="/admin/coaches/summary" variant="secondary">💰 Payroll &amp; attendance</LinkButton>
            )}
            {active === "students" && (
              <LinkButton href="/admin/leaderboard" variant="secondary">🏆 Leaderboard</LinkButton>
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
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Filters (auto-apply). Hidden tab keeps the active tab on submit. */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value={active} />
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Search</span>
          <FilterSearch name="q" defaultValue={q ?? ""} placeholder="Name…" className="h-9 w-48" />
        </label>
        {active === "students" && (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Rank</span>
              <FilterSelect name="rank" defaultValue={rankFilter} className="h-9 w-40">
                <option value="">All ranks</option>
                {CLASS_RANKS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </FilterSelect>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Status</span>
              <FilterSelect name="status" defaultValue={statusFilter} className="h-9 w-36">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </FilterSelect>
            </label>
          </>
        )}
        {filtered && <LinkButton href={`/admin/people?tab=${active}`} variant="ghost">Clear</LinkButton>}
      </form>

      {active === "students" && <StudentsList q={q} status={statusFilter} rank={rankFilter} />}
      {active === "parents" && (
        <PeopleList
          role="parent"
          embedded
          q={q}
          deleteAction={deletePerson.bind(null, "parent")}
          deleteManyAction={deletePeople.bind(null, "parent")}
        />
      )}
      {active === "coaches" && (
        <PeopleList
          role="coach"
          embedded
          q={q}
          deleteAction={deletePerson.bind(null, "coach")}
          deleteManyAction={deletePeople.bind(null, "coach")}
        />
      )}
    </div>
  );
}
