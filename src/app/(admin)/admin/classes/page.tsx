import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState, cn } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { FilterSelect, FilterSearch } from "@/components/filter-controls";
import { CLASS_RANKS, rankBadgeClass } from "@/lib/ranks";
import { deleteClass, deleteClasses } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rank?: string; active?: string }>;
}) {
  const { q, rank, active } = await searchParams;
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("*, coach:profiles!classes_coach_id_fkey(full_name), enrollments(count)")
    .order("name");

  const search = (q ?? "").trim().toLowerCase();
  const rankFilter = rank && (CLASS_RANKS as readonly string[]).includes(rank) ? rank : "";
  const activeFilter = active === "active" || active === "inactive" ? active : "";
  const filtered = Boolean(search || rankFilter || activeFilter);

  const rows = (classes ?? []).filter((c: any) => {
    if (search && !c.name.toLowerCase().includes(search)) return false;
    if (rankFilter && c.level !== rankFilter) return false;
    if (activeFilter === "active" && !c.is_active) return false;
    if (activeFilter === "inactive" && c.is_active) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Classes & Schedule"
        description="Training classes, coaches and enrolment. Open a class to set its weekly schedule and generate sessions."
        action={<LinkButton href="/admin/classes/new">+ New class</LinkButton>}
      />

      {/* Filters (auto-apply) */}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Search</span>
          <FilterSearch name="q" defaultValue={q ?? ""} placeholder="Class name…" className="h-9 w-48" />
        </label>
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
          <FilterSelect name="active" defaultValue={activeFilter} className="h-9 w-36">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </FilterSelect>
        </label>
        {filtered && <LinkButton href="/admin/classes" variant="ghost">Clear</LinkButton>}
      </form>

      {rows.length > 0 ? (
        <Section title={`${filtered ? "Classes (filtered)" : "Classes"} (${rows.length})`} flush>
          <BulkProvider>
          <Table>
            <thead>
              <tr>
                <Th className="w-10"><BulkSelectAll /></Th>
                <Th>Name</Th>
                <Th>Rank</Th>
                <Th>Primary coach</Th>
                <Th>Students</Th>
                <Th>Active</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td><BulkCheckbox id={c.id} /></Td>
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td label="Rank">
                    {c.level ? (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(c.level))}>
                        {c.level}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-slate-500">{c.coach?.full_name ?? "—"}</Td>
                  <Td className="tabular-nums">{c.enrollments?.[0]?.count ?? 0}</Td>
                  <Td>
                    <Badge tone={c.is_active ? "green" : "slate"}>
                      {c.is_active ? "active" : "inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`/admin/classes/${c.id}`} variant="secondary">
                        Manage
                      </LinkButton>
                      <form action={deleteClass}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton confirmText={`Delete class "${c.name}"?`} />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="px-5 pb-5">
            <BulkBar
              action={deleteClasses}
              label="class"
              confirmText="Delete {n} selected class(es)? This also removes their schedules and sessions."
            />
          </div>
          </BulkProvider>
        </Section>
      ) : (
        <EmptyState message={filtered ? "No classes match these filters." : "No classes yet."} />
      )}
    </div>
  );
}
