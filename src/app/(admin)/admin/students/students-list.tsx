import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Collapsible, LinkButton, Table, Th, Td, Badge, EmptyState, cn } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { formatDate } from "@/lib/format";
import { bestRank, rankBadgeClass } from "@/lib/ranks";
import { deleteStudent, deleteStudents } from "./actions";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function RankPill({ rank }: { rank: string | null }) {
  if (!rank) return <span className="text-slate-400">—</span>;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(rank))}>{rank}</span>;
}

// Roster list (mobile cards + desktop table) with bulk delete — no page header,
// so it can be embedded under the unified Directory page or a standalone route.
export async function StudentsList({
  q,
  status,
  rank,
}: {
  q?: string;
  status?: string;
  rank?: string;
} = {}) {
  const supabase = await createClient();
  const [{ data: students }, { data: enrollments }] = await Promise.all([
    supabase.from("students").select("*, parent:profiles!students_parent_id_fkey(full_name)").order("full_name"),
    supabase.from("enrollments").select("student_id, classes(level)").eq("active", true),
  ]);

  // Class rank per student = highest tier among their enrolled classes.
  const levelsByStudent = new Map<string, (string | null)[]>();
  for (const e of (enrollments ?? []) as any[]) {
    const arr = levelsByStudent.get(e.student_id) ?? [];
    arr.push(e.classes?.level ?? null);
    levelsByStudent.set(e.student_id, arr);
  }
  const rankOf = (id: string) => bestRank(levelsByStudent.get(id) ?? []);

  const search = (q ?? "").trim().toLowerCase();
  const rows = (students ?? []).filter((s: any) => {
    if (search && !s.full_name.toLowerCase().includes(search)) return false;
    if (status && s.status !== status) return false;
    if (rank && rankOf(s.id) !== rank) return false;
    return true;
  });

  const filtered = Boolean(search || status || rank);
  if (rows.length === 0) {
    return <EmptyState message={filtered ? "No students match these filters." : "No students yet. Add your first student."} />;
  }

  return (
    <>
      {/* Mobile: tappable cards (no sideways scroll) */}
      <div className="space-y-2 sm:hidden">
        {rows.map((s: any) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/admin/students/${s.id}`} className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                  {initials(s.full_name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{s.full_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {s.parent?.full_name ?? "No parent"} · {formatDate(s.dob)}
                  </span>
                </span>
              </Link>
              <div className="flex flex-shrink-0 items-center gap-2">
                <RankPill rank={rankOf(s.id)} />
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
                    confirmText={`Delete ${s.full_name}? This removes attendance, marks and scorecards.`}
                  />
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: dense table */}
      <div className="hidden sm:block">
        <Collapsible title={filtered ? "Students (filtered)" : "Students"} count={rows.length}>
          <BulkProvider>
          <Table>
            <thead>
              <tr>
                <Th className="w-10"><BulkSelectAll /></Th>
                <Th>Name</Th>
                <Th>Rank</Th>
                <Th>Parent</Th>
                <Th>NFC tag</Th>
                <Th>DOB</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td><BulkCheckbox id={s.id} /></Td>
                  <Td>
                    <Link href={`/admin/students/${s.id}`} className="group flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                        {initials(s.full_name)}
                      </span>
                      <span className="font-medium text-slate-900 group-hover:text-green-700">{s.full_name}</span>
                    </Link>
                  </Td>
                  <Td label="Rank"><RankPill rank={rankOf(s.id)} /></Td>
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
                          confirmText={`Delete ${s.full_name}? This removes attendance, marks and scorecards.`}
                        />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="px-5 pb-5">
            <BulkBar
              action={deleteStudents}
              label="student"
              confirmText="Delete {n} selected student(s)? This removes their attendance, marks and scorecards."
            />
          </div>
          </BulkProvider>
        </Collapsible>
      </div>
    </>
  );
}
