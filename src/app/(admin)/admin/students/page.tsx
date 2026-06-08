import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/format";
import { deleteStudent } from "./actions";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export default async function StudentsPage() {
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("*, parent:profiles!students_parent_id_fkey(full_name)")
    .order("full_name");

  return (
    <div>
      <PageHeader
        title="Students"
        description="Student profiles, NFC tags and parent links."
        action={<LinkButton href="/admin/students/new">+ New student</LinkButton>}
      />

      {students && students.length > 0 ? (
        <Section title={`Students (${students.length})`} flush>
          <Table>
            <thead>
              <tr>
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
                  <Td>
                    <Link href={`/admin/students/${s.id}`} className="flex items-center gap-3 group">
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
        </Section>
      ) : (
        <EmptyState message="No students yet. Add your first student." />
      )}
    </div>
  );
}
