"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsappProvider } from "@/lib/whatsapp";
import { getBaseUrl } from "@/lib/url";
import { monthLabel, formatDateTime } from "@/lib/format";
import { APP_NAME } from "@/lib/constants";
import { renderScorecardPdf } from "@/lib/scorecard-pdf";

const BUCKET = "scorecards";

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => x.toLocaleDateString("en-CA");
  return { start: fmt(start), end: fmt(end) };
}

// Aggregate the current month's data into a score card per active student,
// render a branded PDF, and store it in the private `scorecards` bucket.
export async function generateScorecards() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { start, end } = monthBounds();

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("status", "active");

  for (const s of students ?? []) {
    const [{ data: assessments }, { data: att }, { data: rewards }, { data: latest }] =
      await Promise.all([
        supabase
          .from("assessments")
          .select("overall_score")
          .eq("student_id", s.id)
          .gte("assessed_on", start)
          .lte("assessed_on", end),
        supabase
          .from("attendance")
          .select("status, sessions!inner(session_date)")
          .eq("student_id", s.id)
          .gte("sessions.session_date", start)
          .lte("sessions.session_date", end),
        supabase
          .from("reward_ledger")
          .select("points")
          .eq("student_id", s.id)
          .gte("awarded_at", start)
          .lte("awarded_at", `${end}T23:59:59`),
        supabase
          .from("assessments")
          .select("id, comment, assessment_scores(criterion_name, score, max_score)")
          .eq("student_id", s.id)
          .gte("assessed_on", start)
          .lte("assessed_on", end)
          .order("assessed_on", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const scores = (assessments ?? [])
      .map((a: any) => Number(a.overall_score))
      .filter((n) => !Number.isNaN(n));
    const avgScore = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null;

    const total = (att ?? []).length;
    const attended = (att ?? []).filter((a: any) => a.status === "present" || a.status === "late").length;
    const attendancePct = total ? Math.round((attended / total) * 100) : null;
    const rewardPoints = (rewards ?? []).reduce((x: number, r: any) => x + Number(r.points), 0);

    const criteria = ((latest as any)?.assessment_scores ?? []).map((c: any) => ({
      name: c.criterion_name,
      score: Number(c.score),
      max: Number(c.max_score),
    }));

    // Render + upload PDF
    const bytes = await renderScorecardPdf({
      academyName: APP_NAME,
      studentName: s.full_name,
      periodLabel: monthLabel(start),
      avgScore: avgScore != null ? Math.round(avgScore * 10) / 10 : null,
      attendancePct,
      sessionsAttended: attended,
      sessionsTotal: total,
      rewardPoints,
      criteria,
      comment: (latest as any)?.comment ?? null,
      generatedAt: formatDateTime(new Date().toISOString()),
    });

    const path = `${s.id}/${start}.pdf`;
    await admin.storage.from(BUCKET).upload(path, Buffer.from(bytes), {
      upsert: true,
      contentType: "application/pdf",
    });

    await supabase.from("scorecards").upsert(
      {
        student_id: s.id,
        period_month: start,
        summary: {
          avg_score: avgScore,
          attendance_pct: attendancePct,
          sessions_attended: attended,
          sessions_total: total,
          reward_points: rewardPoints,
          assessments: scores.length,
        },
        pdf_url: path,
        status: "generated",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,period_month" },
    );
  }

  revalidatePath("/admin/scorecards");
}

// Send a generated score card to the parent over WhatsApp (logged either way),
// including a time-limited signed link to the PDF.
export async function sendScorecard(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: sc } = await supabase
    .from("scorecards")
    .select(
      "id, period_month, summary, pdf_url, student_id, students(full_name, parent:profiles!students_parent_id_fkey(full_name, phone, id))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!sc) return;

  const student: any = (sc as any).students;
  const parent = student?.parent;
  const summary: any = sc.summary ?? {};
  if (!parent?.phone) return;

  // Signed link (7 days) so the parent can open the PDF without logging in.
  const baseUrl = await getBaseUrl();
  let pdfLink = `${baseUrl}/parent/scorecards`;
  if (sc.pdf_url) {
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(sc.pdf_url, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) pdfLink = signed.signedUrl;
  }

  const text =
    `🏸 ${monthLabel(sc.period_month)} score card for ${student.full_name}\n` +
    `• Avg skill score: ${summary.avg_score != null ? summary.avg_score.toFixed(1) : "—"}\n` +
    `• Attendance: ${summary.attendance_pct != null ? summary.attendance_pct + "%" : "—"}\n` +
    `• Reward points: ${summary.reward_points ?? 0}\n` +
    `Score card PDF: ${pdfLink}`;

  const result = await getWhatsappProvider().send({ to: parent.phone, text });

  await supabase.from("messages").insert({
    type: "scorecard",
    recipient_profile_id: parent.id,
    recipient_phone: parent.phone,
    body: text,
    scorecard_id: sc.id,
    status: result.status === "sent" ? "sent" : "failed",
    provider_message_id: result.providerMessageId ?? null,
    error: result.error ?? null,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
  });

  if (result.status === "sent") {
    await supabase.from("scorecards").update({ status: "sent" }).eq("id", sc.id);
  }
  revalidatePath("/admin/scorecards");
}

// WhatsApp click-to-chat: the admin opened wa.me with the message; record it in
// the log and mark the card sent. (No API/verification needed.)
export async function logScorecardSend(formData: FormData) {
  const scorecard_id = String(formData.get("scorecard_id"));
  const recipient_phone = String(formData.get("recipient_phone") ?? "");
  const recipient_profile_id = (formData.get("recipient_profile_id") as string) || null;
  const body = String(formData.get("body") ?? "");

  const supabase = await createClient();
  await supabase.from("messages").insert({
    type: "scorecard",
    recipient_profile_id,
    recipient_phone,
    body,
    scorecard_id,
    provider: "wa_click",
    status: "sent",
    sent_at: new Date().toISOString(),
  });
  await supabase.from("scorecards").update({ status: "sent" }).eq("id", scorecard_id);
  revalidatePath("/admin/scorecards");
}
