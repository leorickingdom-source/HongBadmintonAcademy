import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export const runtime = "nodejs";

function esc(v: string | number): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Court rental cost extract — super-admin only (academy finance). RLS on
// court_rentals also enforces is_super_admin().
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const monthParam = new URL(req.url).searchParams.get("month");
  const valid = monthParam && /^\d{4}-\d{2}$/.test(monthParam);
  const monthStr = valid ? monthParam! : new Date().toISOString().slice(0, 7);
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("court_rentals")
    .select("rental_date, hours, amount, note, courts(name)")
    .gte("rental_date", start)
    .lte("rental_date", end)
    .order("rental_date");

  const headers = ["Date", "Court", "Hours", "Amount", "Note"];
  const rows = ((data ?? []) as any[]).map((r) => [r.rental_date, r.courts?.name ?? "", Number(r.hours), Number(r.amount), r.note ?? ""]);
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hba-court-rentals-${monthStr}.csv"`,
    },
  });
}
