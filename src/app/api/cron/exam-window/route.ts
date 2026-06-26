import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { createNotifications, notifyAdmins } from "@/lib/notifications";
import { pushToUsers } from "@/lib/push";
import { coachClassIds } from "@/app/(coach)/coach/_data";
import { examWindowLabel, isExamMonth } from "@/lib/training";

export const runtime = "nodejs";
export const maxDuration = 60;

// Scheduled on the 1st of each exam month (April / August / December — see
// vercel.json). Opens the promotion-exam window: nudges every coach to grade
// their students and tells admins the window is live. Idempotent enough — the
// schedule fires once per window; we still guard on isExamMonth.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isExamMonth()) {
    return NextResponse.json({ ok: true, skipped: "not-exam-month" });
  }

  const db = createAdminClient();
  const label = examWindowLabel();

  const { data: coaches } = await db.from("profiles").select("id").eq("role", "coach");
  let notified = 0;

  for (const c of (coaches ?? []) as { id: string }[]) {
    const classIds = await coachClassIds(db, c.id);
    let count = 0;
    if (classIds.length) {
      const { data: enr } = await db
        .from("enrollments")
        .select("student_id, students!inner(status)")
        .in("class_id", classIds)
        .eq("active", true)
        .eq("students.status", "active");
      count = new Set((enr ?? []).map((e: any) => e.student_id)).size;
    }
    if (!count) continue;

    const body = `Exam window is open — ${label}. ${count} student${count > 1 ? "s" : ""} ready for promotion exams.`;
    await pushToUsers([c.id], { title: "🏸 Level exams open", body, url: "/coach/exams", tag: "exam" });
    await createNotifications([c.id], { type: "exam", title: "🏸 Level exams open", body, url: "/coach/exams" });
    notified += 1;
  }

  await notifyAdmins({
    type: "exam",
    title: "Exam window open",
    body: `${label} — coaches can now grade promotion exams (April / August / December cycle).`,
    url: "/admin/exams",
  });

  return NextResponse.json({ ok: true, window: label, coachesNotified: notified });
}
