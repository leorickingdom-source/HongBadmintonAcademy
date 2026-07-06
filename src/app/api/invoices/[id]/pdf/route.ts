import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getParentIdFromCookie } from "@/lib/parent-auth";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { APP_NAME } from "@/lib/constants";
import { formatCurrency, formatDate, monthLabel } from "@/lib/format";

export const runtime = "nodejs";

const COLS = "id, invoice_no, status, amount, currency, description, period_month, due_date, paid_at, parent_id, branch_id, students(full_name), branches(name), parent:profiles!invoices_parent_id_fkey(full_name)";

// Invoice PDF. Admin/coach via the RLS client (branch-scoped); parent via the
// signed cookie + ownership on parent_id.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let row: any = null;
  if (user) {
    const { data } = await supabase.from("invoices").select(COLS).eq("id", id).maybeSingle();
    row = data;
  } else {
    const pid = await getParentIdFromCookie();
    if (pid) {
      const admin = createAdminClient();
      const { data } = await admin.from("invoices").select(COLS).eq("id", id).eq("parent_id", pid).maybeSingle();
      row = data;
    }
  }
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = await renderInvoicePdf({
    academyName: APP_NAME,
    branchName: row.branches?.name ?? null,
    invoiceNo: row.invoice_no ?? "—",
    status: row.status,
    studentName: row.students?.full_name ?? "Student",
    parentName: row.parent?.full_name ?? null,
    description: row.description ?? "Academy fee",
    periodMonth: row.period_month ? monthLabel(row.period_month) : null,
    dueDate: row.due_date ? formatDate(row.due_date) : null,
    paidAt: row.paid_at ? formatDate(row.paid_at) : null,
    amount: formatCurrency(Number(row.amount), row.currency),
    academyPhone: process.env.ACADEMY_WHATSAPP ?? null,
    generatedAt: formatDate(new Date()),
  });

  const safe = String(row.invoice_no ?? "invoice").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
