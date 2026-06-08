import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Table, Th, Td, EmptyState, Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/format";
import type { Role } from "@/lib/types";

// Shared list view for the parents and coaches admin pages.
export async function PeopleList({
  role,
  deleteAction,
}: {
  role: Role;
  deleteAction: (formData: FormData) => void;
}) {
  const supabase = await createClient();
  const { data: people } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", role)
    .order("full_name");

  const isCoach = role === "coach";
  const base = isCoach ? "/admin/coaches" : "/admin/parents";
  const title = isCoach ? "Coaches" : "Parents";
  const description = isCoach
    ? "Coaching staff accounts and login credentials."
    : "Parent accounts — receive score cards and pay fees.";

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        action={<LinkButton href={`${base}/new`}>+ New {isCoach ? "coach" : "parent"}</LinkButton>}
      />

      {people && people.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {people.map((p: any) => (
              <tr key={p.id}>
                <Td className="font-medium text-slate-900">{p.full_name ?? "—"}</Td>
                <Td>{p.email ?? "—"}</Td>
                <Td>{p.phone ?? "—"}</Td>
                <Td>
                  <Badge tone={p.is_active ? "green" : "slate"}>
                    {p.is_active ? "active" : "inactive"}
                  </Badge>
                </Td>
                <Td>{formatDate(p.created_at)}</Td>
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
      ) : (
        <EmptyState message={`No ${title.toLowerCase()} yet.`} />
      )}
    </div>
  );
}
