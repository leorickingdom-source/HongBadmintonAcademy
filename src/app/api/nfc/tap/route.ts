import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// NFC reader / bridge posts tap events here.
//   POST /api/nfc/tap   header: x-api-key: <NFC_API_KEY>
//   body: { tag_uid: string, reader_id?, class_id?, session_id?, tap_type? }
// Resolves tag → student → today's session, then records tap-in / tap-out.
export async function POST(req: NextRequest) {
  if (!env.nfcApiKey || req.headers.get("x-api-key") !== env.nfcApiKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    tag_uid?: string;
    reader_id?: string;
    class_id?: string;
    session_id?: string;
    tap_type?: "in" | "out";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const tagUid = body.tag_uid?.trim();
  if (!tagUid) {
    return NextResponse.json({ ok: false, error: "tag_uid required" }, { status: 400 });
  }

  const db = createAdminClient();
  const now = new Date();
  const today = now.toLocaleDateString("en-CA"); // YYYY-MM-DD, local tz

  async function logEvent(fields: Record<string, unknown>) {
    await db.from("nfc_tap_events").insert({
      tag_uid: tagUid,
      reader_id: body.reader_id ?? null,
      class_id: body.class_id ?? null,
      raw: body as unknown,
      ...fields,
    });
  }

  // 1. Resolve tag → student
  const { data: student } = await db
    .from("students")
    .select("id, full_name")
    .eq("nfc_tag_uid", tagUid)
    .maybeSingle();

  if (!student) {
    await logEvent({ processed: false, error: "Unknown tag" });
    return NextResponse.json({ ok: false, error: "Unknown tag" }, { status: 404 });
  }

  // 2. Resolve session: explicit > class today > enrolled class today
  let session: { id: string; start_time: string; grace_minutes: number; class_id: string } | null = null;

  if (body.session_id) {
    const { data } = await db
      .from("sessions")
      .select("id, start_time, grace_minutes, class_id")
      .eq("id", body.session_id)
      .maybeSingle();
    session = data;
  } else {
    const { data: enr } = await db
      .from("enrollments")
      .select("class_id")
      .eq("student_id", student.id)
      .eq("active", true);
    const classIds = body.class_id
      ? [body.class_id]
      : (enr ?? []).map((e: { class_id: string }) => e.class_id);

    if (classIds.length) {
      const { data: sessions } = await db
        .from("sessions")
        .select("id, start_time, end_time, grace_minutes, class_id, status")
        .in("class_id", classIds)
        .eq("session_date", today)
        .order("start_time", { ascending: true });
      const list = sessions ?? [];
      session =
        list.find((s: { status: string }) => s.status === "in_progress") ??
        list[0] ??
        null;
    }
  }

  if (!session) {
    await logEvent({ student_id: student.id, processed: false, error: "No session today" });
    return NextResponse.json(
      { ok: false, error: "No session found for today", student: student.full_name },
      { status: 404 },
    );
  }

  // 3. Record tap-in / tap-out
  const { data: existing } = await db
    .from("attendance")
    .select("id, tap_in_at, tap_out_at")
    .eq("session_id", session.id)
    .eq("student_id", student.id)
    .maybeSingle();

  let action: "tap_in" | "tap_out";

  if (!existing) {
    // First tap of the day → tap-in. Flag late if past start + grace.
    const start = new Date(`${today}T${session.start_time}`);
    const lateAfter = new Date(start.getTime() + session.grace_minutes * 60_000);
    const isLate = now > lateAfter;
    await db.from("attendance").insert({
      session_id: session.id,
      student_id: student.id,
      status: isLate ? "late" : "present",
      tap_in_at: now.toISOString(),
      tap_in_tag: tagUid,
      flagged: isLate,
      flag_reason: isLate ? "Late tap-in" : null,
    });
    action = "tap_in";
  } else if (!existing.tap_out_at) {
    await db.from("attendance").update({ tap_out_at: now.toISOString() }).eq("id", existing.id);
    action = "tap_out";
  } else {
    // Already tapped out — refresh tap_out time.
    await db.from("attendance").update({ tap_out_at: now.toISOString() }).eq("id", existing.id);
    action = "tap_out";
  }

  await db.from("nfc_tap_events").insert({
    tag_uid: tagUid,
    reader_id: body.reader_id ?? null,
    class_id: session.class_id,
    session_id: session.id,
    student_id: student.id,
    tap_type: action === "tap_in" ? "in" : "out",
    processed: true,
    raw: body as unknown,
  });

  return NextResponse.json({
    ok: true,
    action,
    student: student.full_name,
    session_id: session.id,
    at: now.toISOString(),
  });
}
