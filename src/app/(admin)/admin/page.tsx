import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, Badge, EmptyState } from "@/components/ui";
import { formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUICK_ACTIONS = [
  { href: "/admin/sessions", icon: "📅", title: "Sessions", sub: "Schedule" },
  { href: "/admin/scorecards", icon: "📊", title: "Growth reports", sub: "Generate & send" },
  { href: "/admin/invoices", icon: "💳", title: "Fees & invoices", sub: "Bill & track" },
  { href: "/admin/people", icon: "👥", title: "Directory", sub: "Students & staff" },
  { href: "/admin/announce", icon: "📢", title: "Announce", sub: "Community" },
];

async function count(table: string, filter?: (q: any) => any) {
  const supabase = await createClient();
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA");

  const [students, coaches, activeClasses, totalClasses, unpaid, queued] = await Promise.all([
    count("students", (q) => q.eq("status", "active")),
    count("profiles", (q) => q.eq("role", "coach")),
    count("classes", (q) => q.eq("is_active", true)),
    count("classes"),
    count("invoices", (q) => q.in("status", ["unpaid", "overdue"])),
    count("messages", (q) => q.eq("status", "queued")),
  ]);

  const { data: todaySessions } = await supabase
    .from("sessions")
    .select("id, start_time, end_time, location, status, classes(name)")
    .eq("session_date", today)
    .order("start_time");

  return (
    <div>
      <PageHeader title="Dashboard" description="What would you like to do?" />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK_ACTIONS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group flex flex-col items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-green-300 hover:shadow-sm"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-50 text-2xl">
              {q.icon}
            </span>
            <div className="w-full min-w-0">
              <div className="line-clamp-2 min-h-[2.5em] font-semibold leading-tight text-slate-900">{q.title}</div>
              <div className="truncate text-xs text-slate-500">{q.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Link href="/admin/people?tab=students" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
          <StatCard label="Active students" value={students} tone="green" />
        </Link>
        <Link href="/admin/coaches/summary" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
          <StatCard label="Coaches & payroll" value={coaches} tone="slate" />
        </Link>
        <Link href="/admin/classes" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
          <StatCard label="Active / total classes" value={`${activeClasses} / ${totalClasses}`} tone="blue" />
        </Link>
        <Link href="/admin/invoices" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
          <StatCard label="Unpaid invoices" value={unpaid} tone={unpaid ? "red" : "slate"} />
        </Link>
        <Link href="/admin/messages" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
          <StatCard label="Queued messages" value={queued} tone={queued ? "amber" : "slate"} />
        </Link>
      </div>

      <div className="mt-8">
        <Section title="Today's sessions" flush>
          {todaySessions && todaySessions.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {todaySessions.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <div className="font-medium text-slate-900">{s.classes?.name ?? "Class"}</div>
                    <div className="text-sm text-slate-500">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.location ?? "—"}
                    </div>
                  </div>
                  <Badge tone={s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><EmptyState message="No sessions scheduled today." /></div>
          )}
        </Section>
      </div>
    </div>
  );
}
