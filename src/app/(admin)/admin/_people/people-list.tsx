import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Collapsible, LinkButton, Table, Th, Td, EmptyState, Badge, Avatar, cn } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { Paginator } from "@/components/paginator";
import { PAGE_SIZE } from "@/lib/constants";
import { SortHeader } from "@/components/sort-header";
import { formatDate } from "@/lib/format";
import { levelBadgeClass } from "@/lib/training";
import type { Role } from "@/lib/types";
import type { ReactNode } from "react";

type SortKey = "name" | "email" | "joined" | "status";

const SORT_COLUMN: Record<SortKey, string> = {
  name: "full_name",
  email: "email",
  joined: "created_at",
  status: "is_active",
};

// Shared list view for the parents and coaches admin pages.
export async function PeopleList({
  role,
  deleteAction,
  deleteManyAction,
  extraAction,
  embedded,
  q,
  sort,
  dir,
  page = 1,
}: {
  role: Role;
  deleteAction: (formData: FormData) => void;
  deleteManyAction: (formData: FormData) => void;
  extraAction?: ReactNode;
  /** When embedded (e.g. under the Directory page) skip the page header. */
  embedded?: boolean;
  /** Optional name search (Directory filter). */
  q?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  page?: number;
}) {
  const supabase = await createClient();

  const sortKey: SortKey = sort && SORT_COLUMN[sort] ? sort : "name";
  const ascending = dir !== "desc";
  const search = (q ?? "").trim();
  const currentPage = Math.max(1, page);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let qBuilder = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("role", role);
  if (search) qBuilder = qBuilder.ilike("full_name", `%${search}%`);
  qBuilder = qBuilder.order(SORT_COLUMN[sortKey], { ascending });
  qBuilder = qBuilder.range(from, to);

  const { data: people, count } = await qBuilder;
  const total = count ?? 0;

  const isCoach = role === "coach";
  const isParent = role === "parent";
  const base = isCoach ? "/admin/coaches" : "/admin/parents";

  // For the parents tab, show each parent's children inline (the #1 thing admins
  // want to see). One query, grouped by parent_id. Scoped to the visible page.
  const childrenByParent = new Map<string, { name: string; level: number }[]>();
  if (isParent && people && people.length) {
    const { data: kids } = await supabase
      .from("students")
      .select("id, full_name, parent_id, level")
      .in("parent_id", people.map((p: any) => p.id))
      .order("full_name");
    for (const k of (kids ?? []) as any[]) {
      const arr = childrenByParent.get(k.parent_id) ?? [];
      arr.push({ name: k.full_name, level: Number(k.level ?? 1) });
      childrenByParent.set(k.parent_id, arr);
    }
  }
  const title = isCoach ? "Coaches" : "Parents";
  const description = isCoach
    ? "Coaching staff accounts and login credentials."
    : "Parent accounts — receive progress cards and pay fees.";

  return (
    <div>
      {!embedded && (
        <PageHeader
          title={title}
          description={description}
          action={
            <>
              {extraAction}
              <LinkButton href={`${base}/new`}>+ New {isCoach ? "coach" : "parent"}</LinkButton>
            </>
          }
        />
      )}

      {total > 0 ? (
        <Collapsible title={title} count={total}>
          <BulkProvider>
          <Table>
            <thead>
              <tr>
                <Th className="w-10"><BulkSelectAll /></Th>
                <Th><SortHeader label="Name" sortKey="name" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                {isParent && <Th>Children</Th>}
                <Th><SortHeader label="Email" sortKey="email" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                <Th>Phone</Th>
                <Th><SortHeader label="Status" sortKey="status" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                <Th><SortHeader label="Joined" sortKey="joined" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(people ?? []).map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td><BulkCheckbox id={p.id} /></Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name ?? "?"} size={32} />
                      <Link href={`${base}/${p.id}`} className="font-medium text-slate-900 hover:text-green-700 hover:underline">
                        {p.full_name ?? "—"}
                      </Link>
                    </div>
                  </Td>
                  {isParent && (
                    <Td label="Children" className="text-slate-600">
                      {(() => {
                        const kids = childrenByParent.get(p.id) ?? [];
                        if (!kids.length) return <span className="text-slate-400">—</span>;
                        return (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {kids.map((k, i) => (
                              <span key={i} className="inline-flex items-center gap-1">
                                {k.name}
                                <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold", levelBadgeClass(k.level))}>L{k.level}</span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </Td>
                  )}
                  <Td label="Email" className="text-slate-500">{p.email ?? "—"}</Td>
                  <Td label="Phone" className="text-slate-500">{p.phone ?? "—"}</Td>
                  <Td label="Status">
                    <Badge tone={p.is_active ? "green" : "slate"}>
                      {p.is_active ? "active" : "inactive"}
                    </Badge>
                  </Td>
                  <Td label="Joined" className="text-slate-500">{formatDate(p.created_at)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`${base}/${p.id}`} variant="secondary">
                        Edit
                      </LinkButton>
                      <form action={deleteAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton
                          confirmText={`Delete ${p.full_name ?? "this account"}? This permanently removes their login.`}
                        />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Paginator page={currentPage} total={total} />
          <div className="px-5 pb-5">
            <BulkBar
              action={deleteManyAction}
              label={isCoach ? "coach" : "parent"}
              confirmText={`Delete {n} selected ${isCoach ? "coach" : "parent"} account(s)? This permanently removes their logins.`}
            />
          </div>
          </BulkProvider>
        </Collapsible>
      ) : (
        <EmptyState message={search ? `No ${title.toLowerCase()} match "${search}".` : `No ${title.toLowerCase()} yet.`} />
      )}
    </div>
  );
}
