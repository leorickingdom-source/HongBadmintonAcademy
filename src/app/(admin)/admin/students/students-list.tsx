import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { formatDate } from "@/lib/format";
import { deleteStudent, deleteStudents } from "./actions";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

// Roster list (mobile cards + desktop table) with bulk delete — no page header,
// so it can be embedded under the unified People page or a standalone route.
export async function StudentsList() {
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("*, parent:profiles!students_parent_id_fkey(full_name)")
    .order("full_name");

  if (!students || students.length === 0) {
    return <EmptyState message="No students yet. Add your first student." />;
  }

  return (
    <>
      {/* Mobile: tappable cards (no sideways scroll) */}
      <div className="space-y-2 sm:hidden">
        {students.map((s: any) => (
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
              <Badge tone={s.status === "active" ? "green" : "slate"}>{s.status}</Badge>
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
        <Section title={`Students (${students.length})`} flush>
          <BulkProvider>
          <Table>
            <thead>
              <tr>
                <Th className="w-10"><BulkSelectAll /></Th>
                <Th>Name</Th>
                <Th>Parent</Th>
                <Th>NFC tag</Th>
                <Th>DOB</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: any) => (
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
        </Section>
      </div>
    </>
  );
}
