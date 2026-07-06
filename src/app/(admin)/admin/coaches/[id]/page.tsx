import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBranches } from "@/lib/branch";
import { PageHeader, Section, StatCard, Badge, EmptyState, LinkButton } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { PersonForm } from "../../_people/person-form";
import { updatePerson } from "../../_people/actions";

export const dynamic = "force-dynamic";

export default async function EditCoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: person }, { data: primary }, { data: cc }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("classes").select("id, name, is_active").eq("coach_id", id),
    supabase.from("class_coaches").select("classes(id, name, is_active)").eq("coach_id", id),
  ]);
  if (!person) notFound();

  // Merge primary-coach + co-coach classes, unique by id.
  const classMap = new Map<string, { id: string; name: string; is_active: boolean }>();
  for (const c of primary ?? []) classMap.set(c.id, c as any);
  for (const row of cc ?? []) {
    const c = (row as any).classes;
    if (c) classMap.set(c.id, c);
  }
  const classes = [...classMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  // This-month performance (MYT): lessons, attendance %, pay, active students.
  const classIds = [...classMap.keys()];
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const mStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const mEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const [{ data: payRow }, { data: mSess }, { data: enr }] = await Promise.all([
    supabase.from("coach_pay").select("pay_per_lesson").eq("coach_id", id).maybeSingle(),
    classIds.length
      ? supabase.from("sessions").select("id").in("class_id", classIds).gte("session_date", mStart).lte("session_date", mEnd)
      : Promise.resolve({ data: [] as any[] }),
    classIds.length
      ? supabase.from("enrollments").select("student_id").in("class_id", classIds).eq("active", true)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const rate = Number(payRow?.pay_per_lesson ?? 0);
  const lessons = (mSess ?? []).length;
  const mSessIds = (mSess ?? []).map((s: any) => s.id);
  const { data: att } = mSessIds.length
    ? await supabase.from("attendance").select("status").in("session_id", mSessIds)
    : { data: [] as any[] };
  const came = (att ?? []).filter((a: any) => a.status === "present" || a.status === "late").length;
  const attPct = att && att.length ? Math.round((came / att.length) * 100) : null;
  const students = new Set((enr ?? []).map((e: any) => e.student_id)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit coach"
        description={person.full_name ?? undefined}
        action={<LinkButton href="/admin/coaches/summary" variant="ghost">Pay & attendance →</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Lessons" value={lessons} sub="this month" />
        <StatCard label="Attendance" value={attPct != null ? `${attPct}%` : "—"} tone={attPct != null && attPct >= 70 ? "green" : "amber"} sub="this month" />
        <StatCard label="Pay" value={formatCurrency(lessons * rate)} tone="green" sub="this month" />
        <StatCard label="Students" value={students} sub="active" />
      </div>

      <Section title={`Classes (${classes.length})`} flush>
        {classes.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {classes.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/classes/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <Badge tone={c.is_active ? "green" : "slate"}>{c.is_active ? "active" : "inactive"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message="Not assigned to any classes yet." /></div>
        )}
      </Section>

      <PersonForm
        role="coach"
        person={person}
        action={updatePerson.bind(null, "coach")}
        branches={await listBranches()}
        showBranch
        allowEmailEdit
        error={error}
      />
    </div>
  );
}
