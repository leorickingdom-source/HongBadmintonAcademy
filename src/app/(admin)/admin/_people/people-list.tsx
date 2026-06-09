import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, EmptyState, Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/format";
import type { Role } from "@/lib/types";
import type { ReactNode } from "react";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

// Shared list view for the parents and coaches admin pages.
export async function PeopleList({
  role,
  deleteAction,
  extraAction,
}: {
  role: Role;
  deleteAction: (formData: FormData) => void;
  extraAction?: ReactNode;
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
        action={
          <>
            {extraAction}
            <LinkButton href={`${base}/new`}>+ New {isCoach ? "coach" : "parent"}</LinkButton>
          </>
        }
      />

      {people && people.length > 0 ? (
        <Section title={`${title} (${people.length})`} flush>
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
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                        {initials(p.full_name ?? "?")}
                      </span>
                      <span className="font-medium text-slate-900">{p.full_name ?? "—"}</span>
                    </div>
                  </Td>
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
        </Section>
      ) : (
        <EmptyState message={`No ${title.toLowerCase()} yet.`} />
      )}
    </div>
  );
}
