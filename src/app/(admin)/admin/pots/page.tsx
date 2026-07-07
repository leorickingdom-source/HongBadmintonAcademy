import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getViewBranchId, listBranches } from "@/lib/branch";
import { PageHeader, Card, Table, Th, Td, cn } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { computePots } from "@/lib/pots";

export const dynamic = "force-dynamic";

export default async function PotsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Revenue split is super-admin only, like the rest of Analytics.
  const me = await requireSuperAdmin();
  const supabase = await createClient();
  const { month } = await searchParams;
  const nowD = new Date();
  const monthStr = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  const [my, mm] = monthStr.split("-").map(Number);
  const thisM = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;

  const bf = await getViewBranchId(me);
  const branches = await listBranches(false);
  const branchLabel = bf ? branches.find((b) => b.id === bf)?.name ?? null : null;

  const p = await computePots(supabase, new Date(my, mm - 1, 1), bf);
  const cur = (n: number) => formatCurrency(n, "MYR");

  const prevM = `${mm === 1 ? my - 1 : my}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
  const nextM = `${mm === 12 ? my + 1 : my}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;

  const Arm = ({ label, tone, t }: { label: string; tone: "academy" | "club"; t: typeof p.academy }) => (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className={cn("inline-block h-2.5 w-2.5 rounded-full", tone === "club" ? "bg-emerald-500" : "bg-blue-500")} />
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <div className="mt-2 text-3xl font-bold text-slate-900">{cur(t.collected)}</div>
      <div className="text-xs text-slate-500">collected this month</div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span>Billed <span className="font-medium text-slate-700">{cur(t.billed)}</span></span>
        <span>Outstanding <span className={cn("font-medium", t.outstanding > 0 ? "text-amber-600" : "text-slate-700")}>{cur(t.outstanding)}</span></span>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pots — Academy vs Club"
        description="Revenue by arm. One entity, one Stripe account — split by the payment's business tag."
      />

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <Link href={`/admin/pots?month=${prevM}`} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900">{p.monthLabel}{branchLabel ? ` · ${branchLabel}` : ""}</div>
          {monthStr !== thisM && (
            <Link href={`/admin/pots?month=${thisM}`} className="text-xs font-medium text-green-700 hover:underline">Back to this month</Link>
          )}
        </div>
        <Link href={`/admin/pots?month=${nextM}`} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Arm label="Academy" tone="academy" t={p.academy} />
        <Arm label="Club" tone="club" t={p.club} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <Th>Line</Th><Th className="text-right">Academy</Th><Th className="text-right">Club</Th><Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td label="Line">Collected</Td>
              <Td className="text-right" label="Academy">{cur(p.academy.collected)}</Td>
              <Td className="text-right" label="Club">{cur(p.club.collected)}</Td>
              <Td className="text-right font-medium" label="Total">{cur(p.total.collected)}</Td>
            </tr>
            <tr>
              <Td label="Line">Billed</Td>
              <Td className="text-right" label="Academy">{cur(p.academy.billed)}</Td>
              <Td className="text-right" label="Club">{cur(p.club.billed)}</Td>
              <Td className="text-right font-medium" label="Total">{cur(p.total.billed)}</Td>
            </tr>
            <tr>
              <Td label="Line">Outstanding</Td>
              <Td className="text-right" label="Academy">{cur(p.academy.outstanding)}</Td>
              <Td className="text-right" label="Club">{cur(p.club.outstanding)}</Td>
              <Td className="text-right font-medium" label="Total">{cur(p.total.outstanding)}</Td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <p className="px-1 text-xs text-slate-400">
        Expenses (court cost, coach salaries) aren&apos;t arm-tagged yet — the pot&apos;s spend side and the &quot;available to draw&quot; balance land in the next slice.
      </p>
    </div>
  );
}
