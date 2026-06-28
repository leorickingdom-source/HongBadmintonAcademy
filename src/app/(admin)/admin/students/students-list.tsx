import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Collapsible, LinkButton, Table, Th, Td, Badge, EmptyState, Avatar, cn } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { Paginator } from "@/components/paginator";
import { PAGE_SIZE } from "@/lib/constants";
import { SortHeader } from "@/components/sort-header";
import { formatDate } from "@/lib/format";
import { levelBadgeClass, levelName } from "@/lib/training";
import { deleteStudent, deleteStudents } from "./actions";

function LevelPill({ level }: { level: number }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", levelBadgeClass(level))}>L{level} · {levelName(level)}</span>;
}

type SortKey = "name" | "level" | "dob" | "status" | "joined";

const SORT_COLUMN: Record<SortKey, string> = {
  name: "full_name",
  level: "level",
  dob: "dob",
  status: "status",
  joined: "created_at",
};

// Roster list (mobile cards + desktop table) with bulk delete — no page header,
// so it can be embedded under the unified Directory page or a standalone route.
export async function StudentsList({
  q,
  status,
  rank,
  sort,
  dir,
  page = 1,
}: {
  q?: string;
  status?: string;
  rank?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  page?: number;
} = {}) {
  const supabase = await createClient();

  const sortKey: SortKey = sort && SORT_COLUMN[sort] ? sort : "name";
  const ascending = dir !== "desc";

  let base = supabase
    .from("students")
    .select("*, parent:profiles!students_parent_id_fkey(full_name)");
  const search = (q ?? "").trim();
  if (search) base = base.ilike("full_name", `%${search}%`);
  if (status === "active" || status === "inactive") base = base.eq("status", status);
  base = base.order(SORT_COLUMN[sortKey], { ascending });

  const { data: students } = await base;

  const levelOf = (s: any) => Number(s.level ?? 1);

  // The `rank` filter param now carries a training-level NAME (the dropdown is
  // seeded from the 6 level names) — match it against the student's level.
  const filteredAll = (students ?? []).filter((s: any) => {
    if (rank && levelName(levelOf(s)) !== rank) return false;
    return true;
  });

  const total = filteredAll.length;
  const currentPage = Math.max(1, page);
  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = filteredAll.slice(start, start + PAGE_SIZE);

  const filtered = Boolean(search || status || rank);
  if (total === 0) {
    return filtered ? (
      <EmptyState message="No students match these filters." />
    ) : (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        message="No students yet"
        hint="Add your first student to start taking attendance, grading exams and billing fees."
        action={<LinkButton href="/admin/students/new">+ Add student</LinkButton>}
      />
    );
  }

  return (
    <>
      {/* Mobile: tappable cards (no sideways scroll) */}
      <div className="space-y-2 sm:hidden">
        {rows.map((s: any) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/admin/students/${s.id}`} className="flex min-w-0 items-center gap-2.5">
                <Avatar name={s.full_name} src={s.photo_url} size={36} className="flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{s.full_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {s.parent?.full_name ?? "No parent"} · {formatDate(s.dob)}
                  </span>
                </span>
              </Link>
              <div className="flex flex-shrink-0 items-center gap-2">
                <LevelPill level={levelOf(s)} />
                <Badge tone={s.status === "active" ? "green" : "slate"}>{s.status}</Badge>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
              <span className="truncate text-xs text-slate-500">
                {s.nfc_tag_uid ? (
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{s.nfc_tag_uid}</code>
                ) : (
                  "No NFC tag"
                )}
              </span>
              <div className="flex flex-shrink-0 gap-2">
                <LinkButton href={`/admin/students/${s.id}/edit`} variant="secondary" className="!px-3 !py-1.5 text-xs">
                  Edit
                </LinkButton>
                <form action={deleteStudent}>
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmButton
                    label="Delete"
                    confirmText={`Delete ${s.full_name}? This removes attendance, marks and exam results.`}
                  />
                </form>
              </div>
            </div>
          </div>
        ))}
        <Paginator page={currentPage} total={total} />
      </div>

      {/* Desktop: dense table */}
      <div className="hidden sm:block">
        <Collapsible title={filtered ? "Students (filtered)" : "Students"} count={total}>
          <BulkProvider>
          <Table>
            <thead>
              <tr>
                <Th className="w-10"><BulkSelectAll /></Th>
                <Th><SortHeader label="Name" sortKey="name" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                <Th><SortHeader label="Level" sortKey="level" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                <Th>Parent</Th>
                <Th>NFC tag</Th>
                <Th><SortHeader label="DOB" sortKey="dob" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                <Th><SortHeader label="Status" sortKey="status" current={sortKey} dir={ascending ? "asc" : "desc"} /></Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td><BulkCheckbox id={s.id} /></Td>
                  <Td>
                    <Link href={`/admin/students/${s.id}`} className="group flex items-center gap-3">
                      <Avatar name={s.full_name} src={s.photo_url} size={32} />
                      <span className="font-medium text-slate-900 group-hover:text-green-700">{s.full_name}</span>
                    </Link>
                  </Td>
                  <Td label="Level"><LevelPill level={levelOf(s)} /></Td>
                  <Td className="text-slate-500">{s.parent?.full_name ?? "—"}</Td>
                  <Td>{s.nfc_tag_uid ? <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{s.nfc_tag_uid}</code> : "—"}</Td>
                  <Td className="text-slate-500">{formatDate(s.dob)}</Td>
                  <Td>
                    <Badge tone={s.status === "active" ? "green" : "slate"}>{s.status}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`/admin/students/${s.id}/edit`} variant="secondary">
                        Edit
                      </LinkButton>
                      <form action={deleteStudent}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton
                          label="Delete"
                          confirmText={`Delete ${s.full_name}? This removes attendance, marks and exam results.`}
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
              action={deleteStudents}
              label="student"
              confirmText="Delete {n} selected student(s)? This removes their attendance, marks and exam results."
            />
          </div>
          </BulkProvider>
        </Collapsible>
      </div>
    </>
  );
}
