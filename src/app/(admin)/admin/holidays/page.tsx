import { CalendarOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PageHeader, Section, Field, Input, Button, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Tabs } from "@/components/tabs";
import { formatDate } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { addSchoolHoliday, deleteSchoolHoliday, importPublicHolidays, clearImportedHolidays, removeHolidaySessions } from "./actions";

export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; removed?: string }>;
}) {
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const { error, imported, removed } = await searchParams;
  const supabase = await createClient();
  const [{ data: holidays }, { data: importedRows }] = await Promise.all([
    supabase.from("school_holidays").select("*").order("start_date", { ascending: false }),
    supabase.from("public_holidays").select("*").order("holiday_date", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.hol_title}
        description={L.hol_desc}
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {imported && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {L.hol_imported.replace("{n}", imported)}
        </p>
      )}
      {removed && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {L.hol_removed.replace("{n}", removed)}
        </p>
      )}

      <Section title={L.hol_add} description={L.hol_add_desc}>
        <Tabs
          tabs={[
            {
              id: "school",
              label: L.hol_tab_school,
              content: (
                <form action={addSchoolHoliday} className="grid items-end gap-4 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Field label={L.col_name} required>
                      <Input name="name" placeholder="e.g. Term 1 break, Deepavali closure" required />
                    </Field>
                  </div>
                  <Field label={L.hol_from} required>
                    <Input type="date" name="start_date" required />
                  </Field>
                  <Field label={L.hol_to_blank}>
                    <Input type="date" name="end_date" />
                  </Field>
                  <Button type="submit">{L.hol_add_btn}</Button>
                </form>
              ),
            },
            {
              id: "import",
              label: L.hol_tab_import,
              content: (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500">{L.hol_import_hint}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={importPublicHolidays} className="flex flex-wrap items-center gap-3">
                      <input
                        type="file"
                        name="file"
                        accept=".csv,.xlsx"
                        required
                        className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
                      />
                      <Button type="submit">{L.hol_import_btn}</Button>
                    </form>
                    {importedRows && importedRows.length > 0 && (
                      <form action={clearImportedHolidays}>
                        <ConfirmButton label={L.hol_clear_imported} confirmText={L.hol_clear_confirm.replace("{n}", String(importedRows.length))} />
                      </form>
                    )}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Section>

      <Section title={`${L.hol_school_section} (${holidays?.length ?? 0})`} flush>
        {holidays && holidays.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>{L.col_name}</Th><Th>{L.hol_from}</Th><Th>{L.hol_to}</Th><Th className="text-right">—</Th></tr>
            </thead>
            <tbody>
              {holidays.map((h: any) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{h.name}</Td>
                  <Td label={L.hol_from} className="text-slate-500">{formatDate(h.start_date)}</Td>
                  <Td label={L.hol_to} className="text-slate-500">{formatDate(h.end_date)}</Td>
                  <Td label={L.col_actions} className="text-right">
                    <form action={deleteSchoolHoliday}>
                      <input type="hidden" name="id" value={h.id} />
                      <ConfirmButton label={L.hol_remove} confirmText={L.hol_remove_confirm.replace("{name}", h.name)} />
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
              message={L.hol_empty}
              hint={L.hol_empty_hint}
            />
          </div>
        )}
      </Section>

      <Section title={L.hol_cleanup} description={L.hol_cleanup_desc}>
        <form action={removeHolidaySessions}>
          <ConfirmButton label={L.hol_remove_sessions} confirmText={L.hol_remove_sessions_confirm} />
        </form>
      </Section>

      {importedRows && importedRows.length > 0 && (
        <Section title={`${L.hol_imported_section} (${importedRows.length})`} flush>
          <Table>
            <thead><tr><Th>{L.col_date}</Th><Th>{L.hol_holiday}</Th></tr></thead>
            <tbody>
              {importedRows.map((h: any) => (
                <tr key={h.holiday_date} className="hover:bg-slate-50">
                  <Td className="text-slate-600">{formatDate(h.holiday_date)}</Td>
                  <Td label={L.hol_holiday}><Badge tone="green">{h.name}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

    </div>
  );
}
