import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateScorecardsCore } from "@/lib/scorecards";
import { upsertCommunityMonthlyNotice } from "@/lib/reminders";
import { pushToUsers } from "@/lib/push";
import { createNotifications } from "@/lib/notifications";
import { getMonthlySchedule, mytDayOfMonth } from "@/lib/settings";
import { getBaseUrl } from "@/lib/url";
import { isAuthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";
// Loops all active students and renders a PDF each — give it room past the
// short serverless default (60s is the Hobby cap; raise on Pro if the roster
// grows large enough to need it).
export const maxDuration = 60;

// Runs DAILY (see vercel.json) but only acts on the admin-set report day
// (Settings → Monthly schedule). Generates the *previous* month's Growth Report
// PDF per active student, then upserts the monthly Community notice (so reports
// are announced even if the report day differs from the billing day).
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedule = await getMonthlySchedule();
  const today = mytDayOfMonth();
  if (today !== schedule.runDay) {
    return NextResponse.json({ ok: true, skipped: "not-run-day", today, runDay: schedule.runDay });
  }

  // Report on the month that just ended.
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const db = createAdminClient();
  try {
    const result = await generateScorecardsCore(db, db, prevMonth);

    // Notify parents (best-effort web push) that this month's report is ready.
    const monthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const { data: cards } = await db.from("scorecards").select("student_id").eq("period_month", monthStart);
    const sids = [...new Set((cards ?? []).map((c: any) => c.student_id))];
    const { data: studs } = sids.length
      ? await db.from("students").select("parent_id").in("id", sids)
      : { data: [] as any[] };
    const parentIds = [...new Set((studs ?? []).map((s: any) => s.parent_id).filter(Boolean))];
    if (parentIds.length) {
      await pushToUsers(parentIds, {
        title: "Growth report ready",
        body: "Your child's monthly Growth Report is ready to view.",
        url: "/parent/scorecards",
        tag: "report",
      });
      await createNotifications(parentIds, {
        type: "report",
        title: "Growth report ready",
        body: "Your child's monthly Growth Report is ready to view.",
        url: "/parent/scorecards",
      });
    }

    const notice = await upsertCommunityMonthlyNotice(await getBaseUrl());
    const label = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
    return NextResponse.json({ ok: true, month: label, ...result, notice });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
