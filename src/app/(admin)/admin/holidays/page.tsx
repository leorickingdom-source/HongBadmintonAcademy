import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Field, Input, Button, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/format";
import { MY_PUBLIC_HOLIDAYS } from "@/lib/holidays";
import { addSchoolHoliday, deleteSchoolHoliday } from "./actions";

export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: holidays } = await supabase
    .from("school_holidays")
    .select("*")
    .order("start_date", { ascending: false });

  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const upcomingPublic = MY_PUBLIC_HOLIDAYS.filter((h) => h.date >= today).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays"
        description="School holidays block classes (skipped when generating sessions) and show on the schedule. Malaysian public holidays are built in."
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <Section title="Add a school holiday">
        <form action={addSchoolHoliday} className="grid items-end gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="Name" required>
              <Input name="name" placeholder="e.g. Term 1 break, Deepavali closure" required />
            </Field>
          </div>
          <Field label="From" required>
            <Input type="date" name="start_date" required />
          </Field>
          <Field label="To (blank = one day)">
            <Input type="date" name="end_date" />
          </Field>
          <Button type="submit">+ Add holiday</Button>
        </form>
      </Section>

      <Section title={`School holidays (${holidays?.length ?? 0})`} flush>
        {holidays && holidays.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>From</Th><Th>To</Th><Th className="text-right">—</Th></tr>
            </thead>
            <tbody>
              {holidays.map((h: any) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{h.name}</Td>
                  <Td className="text-slate-500">{formatDate(h.start_date)}</Td>
                  <Td className="text-slate-500">{formatDate(h.end_date)}</Td>
                  <Td className="text-right">
                    <form action={deleteSchoolHoliday}>
                      <input type="hidden" name="id" value={h.id} />
                      <ConfirmButton label="Remove" confirmText={`Remove "${h.name}"?`} />
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="px-5 pt-5"><EmptyState message="No school holidays added yet." /></div>
        )}
      </Section>

      <Section title="Malaysian public holidays" description="Built-in (national). Shown on the schedule; edit in src/lib/holidays.ts." flush>
        <Table>
          <thead><tr><Th>Date</Th><Th>Holiday</Th></tr></thead>
          <tbody>
            {(upcomingPublic.length ? upcomingPublic : MY_PUBLIC_HOLIDAYS.slice(0, 8)).map((h) => (
              <tr key={h.date} className="hover:bg-slate-50">
                <Td className="text-slate-600">{formatDate(h.date)}</Td>
                <Td><Badge tone="slate">{h.name}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </div>
  );
}
