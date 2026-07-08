import { GraduationCap, ClipboardList, FileText, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHeader, Card, LinkButton, ICON_TINT, cn } from "@/components/ui";
import { dict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  // Financial extracts (invoices, payments) are super-admin only.
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const EXPORTS = [
    { type: "students", label: L.rep_students, desc: L.rep_students_desc, Icon: GraduationCap, tone: "blue", superOnly: false },
    { type: "attendance", label: L.rep_attendance, desc: L.rep_attendance_desc, Icon: ClipboardList, tone: "green", superOnly: false },
    { type: "invoices", label: L.rep_invoices, desc: L.rep_invoices_desc, Icon: FileText, tone: "amber", superOnly: true },
    { type: "payments", label: L.rep_payments, desc: L.rep_payments_desc, Icon: Wallet, tone: "teal", superOnly: true },
  ];
  const exports = EXPORTS.filter((e) => me.role === "super_admin" || !e.superOnly);
  return (
    <div>
      <PageHeader
        title={L.rep_title}
        description={L.rep_desc}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {exports.map((e) => (
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
