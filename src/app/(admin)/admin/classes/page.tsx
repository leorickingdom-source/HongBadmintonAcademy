import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Input, Button, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { WeeklyTimetable } from "@/components/weekly-timetable";
import { createClass, deleteClass, deleteClasses } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const supabase = await createClient();
  const [{ data: classes }, { data: slots }] = await Promise.all([
    supabase
      .from("classes")
      .select("*, coach:profiles!classes_coach_id_fkey(full_name), enrollments(count)")
      .order("name"),
    supabase
      .from("class_schedules")
      .select("day_of_week, start_time, end_time, location, classes(name)")
      .eq("is_active", true),
  ]);
  const timetableSlots = (slots ?? [])
    .map((s: any) => ({
      className: s.classes?.name ?? "Class",
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      location: s.location,
    }));

  return (
    <div>
      <PageHeader
        title="Classes & Schedule"
        description="Training classes, weekly schedules, coaches and enrolment."
        action={
          <form action={createClass} className="flex items-center gap-2">
            <Input name="name" placeholder="New class name" required className="h-9 w-48" />
            <Button type="submit">+ Create</Button>
          </form>
        }
      />

      {timetableSlots.length > 0 && (
        <Section title="Weekly timetable" description="Every class's regular slots, Mon–Sun." className="mb-6">
          <WeeklyTimetable slots={timetableSlots} />
        </Section>
      )}

      {classes && classes.length > 0 ? (
        <Section title={`Classes (${classes.length})`} flush>
          <BulkProvider>
          <Table>
            <thead>
              <tr>
                <Th className="w-10"><BulkSelectAll /></Th>
                <Th>Name</Th>
                <Th>Primary coach</Th>
                <Th>Students</Th>
                <Th>Active</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td><BulkCheckbox id={c.id} /></Td>
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td className="text-slate-500">{c.coach?.full_name ?? "—"}</Td>
                  <Td className="tabular-nums">{c.enrollments?.[0]?.count ?? 0}</Td>
                  <Td>
                    <Badge tone={c.is_active ? "green" : "slate"}>
                      {c.is_active ? "active" : "inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`/admin/classes/${c.id}`} variant="secondary">
                        Manage
                      </LinkButton>
                      <form action={deleteClass}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton confirmText={`Delete class "${c.name}"?`} />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="px-5 pb-5">
            <BulkBar
              action={deleteClasses}
              label="class"
              confirmText="Delete {n} selected class(es)? This also removes their schedules and sessions."
            />
          </div>
          </BulkProvider>
        </Section>
      ) : (
        <EmptyState message="No classes yet." />
      )}
    </div>
  );
}
