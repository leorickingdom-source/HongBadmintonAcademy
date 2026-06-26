import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getParentIdFromCookie } from "@/lib/parent-auth";
import { renderExamPdf, type ExamPdfSection } from "@/lib/exam-pdf";
import { APP_NAME } from "@/lib/constants";
import { bandFor, levelName, DECISION_LABEL, type Decision } from "@/lib/training";
import { formatDate } from "@/lib/format";

export const runtime = "nodejs";

const SELECT =
  "id, exam_date, window_label, from_level, to_level, total, band, decision, scores, coach_comment, next_target, students(full_name)";
const SEC_ORDER = ["technical", "footwork", "tactical", "physical"];

// Render a promotion-exam result PDF on the fly. Authorization mirrors the
// scorecard PDF route: admin/coach through the RLS client; parent via the signed
// cookie + ownership check on the student.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let row: any = null;
  if (user) {
    const { data } = await supabase.from("level_exams").select(SELECT).eq("id", id).maybeSingle();
    row = data;
  } else {
    const pid = await getParentIdFromCookie();
    if (pid) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("level_exams")
        .select(`${SELECT}, students!inner(parent_id)`)
        .eq("id", id)
        .eq("students.parent_id", pid)
        .maybeSingle();
      row = data;
    }
  }

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const review = Number(row.to_level) > 6;
  const sections: ExamPdfSection[] = SEC_ORDER
    .map((key) => {
      const s = row.scores?.[key];
      if (!s) return null;
      return {
        key,
        label: s.label ?? key,
        subtotal: Number(s.subtotal ?? 0),
        max: Number(s.max ?? 0),
        items: (s.items ?? []).map((it: any) => ({ label: it.label, score: Number(it.score), max: Number(it.max) })),
      } as ExamPdfSection;
    })
    .filter(Boolean) as ExamPdfSection[];

  const total = Number(row.total);
  const band = bandFor(total);
  const levelLine = review
    ? `Level ${row.from_level} · Elite review`
    : `Level ${row.from_level} → Level ${row.to_level} (${levelName(row.to_level)})`;

  const bytes = await renderExamPdf({
    academyName: APP_NAME,
    studentName: row.students?.full_name ?? "Student",
    windowLabel: row.window_label ?? null,
    examDate: formatDate(row.exam_date),
    levelLine,
    total,
    bandKey: row.band ?? band.key,
    bandLabel: band.label,
    decisionLabel: DECISION_LABEL[row.decision as Decision] ?? row.decision ?? "—",
    sections,
    comment: row.coach_comment,
    nextTarget: row.next_target,
    generatedAt: formatDate(new Date()),
  });

  const safeName = String(row.students?.full_name ?? "student").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="exam-${safeName}-L${row.from_level}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
