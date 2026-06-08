import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteScheme } from "./actions";

export const dynamic = "force-dynamic";

export default async function SchemesPage() {
  const supabase = await createClient();
  const { data: schemes } = await supabase
    .from("marking_schemes")
    .select("*, marking_criteria(count)")
    .order("name");

  return (
    <div>
      <PageHeader
        title="Marking Schemes"
        description="Criteria + weighting used by coaches to mark students."
        action={<LinkButton href="/admin/marking-schemes/new">+ New scheme</LinkButton>}
      />

      {schemes && schemes.length > 0 ? (
        <Section title={`Schemes (${schemes.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Criteria</Th>
                <Th>Active</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {schemes.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{s.name}</Td>
                  <Td className="tabular-nums text-slate-500">{s.marking_criteria?.[0]?.count ?? 0}</Td>
                  <Td>
                    <Badge tone={s.is_active ? "green" : "slate"}>
                      {s.is_active ? "active" : "inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`/admin/marking-schemes/${s.id}`} variant="secondary">
                        Manage
                      </LinkButton>
                      <form action={deleteScheme}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton confirmText={`Delete scheme "${s.name}" and its criteria?`} />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message="No marking schemes yet." />
      )}
    </div>
  );
}
