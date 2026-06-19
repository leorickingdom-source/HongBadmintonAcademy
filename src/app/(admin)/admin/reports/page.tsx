import { GraduationCap, ClipboardList, FileText, Wallet } from "lucide-react";
import { PageHeader, Card, LinkButton, ICON_TINT, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

const EXPORTS = [
  { type: "students", label: "Students", desc: "Profiles, NFC tags and parent links.", Icon: GraduationCap, tone: "blue" },
  { type: "attendance", label: "Attendance", desc: "Tap-in / tap-out records per session.", Icon: ClipboardList, tone: "green" },
  { type: "invoices", label: "Invoices", desc: "All fees with status and due dates.", Icon: FileText, tone: "amber" },
  { type: "payments", label: "Payments", desc: "Reconciliation log of transactions.", Icon: Wallet, tone: "teal" },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Reports & Export"
        description="Download CSV, Excel or PDF extracts for accounting and analysis."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {EXPORTS.map((e) => (
          <Card key={e.type} className="p-5 transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", ICON_TINT[e.tone])}>
                <e.Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{e.label}</div>
                <div className="text-sm text-slate-500">{e.desc}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <LinkButton href={`/api/export?type=${e.type}&format=csv`} variant="secondary">CSV</LinkButton>
              <LinkButton href={`/api/export?type=${e.type}&format=xlsx`} variant="secondary">Excel</LinkButton>
              <LinkButton href={`/api/export?type=${e.type}&format=pdf`} variant="secondary">PDF</LinkButton>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
