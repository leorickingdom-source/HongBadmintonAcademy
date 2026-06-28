import { CalendarOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Field, Input, Button, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/format";
import { addSchoolHoliday, deleteSchoolHoliday, importPublicHolidays, clearImportedHolidays, removeHolidaySessions } from "./actions";

export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; removed?: string }>;
}) {
  const { error, imported, removed } = await searchParams;
  const supabase = await createClient();
  const [{ data: holidays }, { data: importedRows }] = await Promise.all([
    supabase.from("school_holidays").select("*").order("start_date", { ascending: false }),
    supabase.from("public_holidays").select("*").order("holiday_date", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays"
        description="School holidays block classes (skipped when generating sessions) and show on the schedule. Malaysian federal public holidays are built in automatically — no need to add them."
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {imported && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Imported {imported} public holiday{imported === "1" ? "" : "s"}.
        </p>
      )}
      {removed && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Removed {removed} session{removed === "1" ? "" : "s"} that fell on a holiday.
        </p>
      )}

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
          <div className="p-5">
            <EmptyState
              icon={<CalendarOff className="h-5 w-5" />}
              message="No school holidays yet"
              hint="Add term breaks or closures above — sessions on those dates are skipped when you generate the schedule, and parents see them too."
            />
          </div>
        )}
      </Section>

      <Section title="Clean up sessions" description="Delete upcoming scheduled sessions that fall on a holiday (public, imported or school). Past, completed and cancelled sessions are kept.">
        <form action={removeHolidaySessions}>
          <ConfirmButton label="Remove holiday sessions" confirmText="Delete all upcoming scheduled sessions that fall on a holiday? This cannot be undone." />
        </form>
      </Section>

      <Section title="Import public holidays" description="Upload a CSV or Excel (.xlsx) with two columns: date (YYYY-MM-DD), name. Rows merge with the built-in list and override on matching dates.">
        <div className="flex flex-wrap items-center gap-3">
          <form action={importPublicHolidays} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept=".csv,.xlsx"
              required
              className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
            <Button type="submit">Import</Button>
          </form>
          {importedRows && importedRows.length > 0 && (
            <form action={clearImportedHolidays}>
              <ConfirmButton label="Clear imported" confirmText={`Remove all ${importedRows.length} imported public holidays?`} />
            </form>
          )}
        </div>
      </Section>

      {importedRows && importedRows.length > 0 && (
        <Section title={`Imported public holidays (${importedRows.length})`} flush>
          <Table>
            <thead><tr><Th>Date</Th><Th>Holiday</Th></tr></thead>
            <tbody>
              {importedRows.map((h: any) => (
                <tr key={h.holiday_date} className="hover:bg-slate-50">
                  <Td className="text-slate-600">{formatDate(h.holiday_date)}</Td>
                  <Td><Badge tone="green">{h.name}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

    </div>
  );
}
