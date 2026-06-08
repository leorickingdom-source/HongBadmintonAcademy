import { PageHeader, Card, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const EXPORTS = [
  { type: "students", label: "Students", desc: "Profiles, NFC tags and parent links." },
  { type: "attendance", label: "Attendance", desc: "Tap-in / tap-out records per session." },
  { type: "invoices", label: "Invoices", desc: "All fees with status and due dates." },
  { type: "payments", label: "Payments", desc: "Reconciliation log of transactions." },
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
          <Card key={e.type} className="flex items-center justify-between p-5">
            <div>
              <div className="font-medium text-slate-900">{e.label}</div>
              <div className="text-sm text-slate-500">{e.desc}</div>
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
