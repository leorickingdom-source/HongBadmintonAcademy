import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/format";
import { deleteStudent } from "./actions";

export const dynamic = "force-dynamic";

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
              <tr key={s.id}>
                <Td className="font-medium text-slate-900">{s.full_name}</Td>
                <Td>{s.parent?.full_name ?? "—"}</Td>
                <Td>{s.nfc_tag_uid ? <code className="text-xs">{s.nfc_tag_uid}</code> : "—"}</Td>
                <Td>{formatDate(s.dob)}</Td>
                <Td>
                  <Badge tone={s.status === "active" ? "green" : "slate"}>{s.status}</Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <LinkButton href={`/admin/students/${s.id}`} variant="secondary">
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
      ) : (
        <EmptyState message="No students yet. Add your first student." />
      )}
    </div>
  );
}
