import { PageHeader, Card, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const EXPORTS = [
  { type: "students", label: "Students", desc: "Profiles, NFC tags and parent links.", icon: "🧑‍🎓" },
  { type: "attendance", label: "Attendance", desc: "Tap-in / tap-out records per session.", icon: "📋" },
  { type: "invoices", label: "Invoices", desc: "All fees with status and due dates.", icon: "🧾" },
  { type: "payments", label: "Payments", desc: "Reconciliation log of transactions.", icon: "💳" },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Reports & Export"
        description="Download CSV extracts for accounting and analysis."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {EXPORTS.map((e) => (
          <Card key={e.type} className="flex items-center justify-between gap-4 p-5 transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                {e.icon}
              </span>
              <div>
                <div className="font-semibold text-slate-900">{e.label}</div>
                <div className="text-sm text-slate-500">{e.desc}</div>
              </div>
            </div>
            <LinkButton href={`/api/export?type=${e.type}`} variant="secondary">
              Export CSV
            </LinkButton>
          </Card>
        ))}
      </div>
    </div>
  );
}
