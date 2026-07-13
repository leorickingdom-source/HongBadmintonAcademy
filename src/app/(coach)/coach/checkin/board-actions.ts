"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { haversineMeters } from "@/lib/geo";
import { getBranchGeofence } from "@/lib/geofence";
import { coachClassIds } from "../_data";
import type { AttendanceStatus } from "@/lib/types";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

export async function setAttendanceAction(input: {
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input?.session_id || !input?.student_id) return { ok: false, error: "missing" };
  if (!STATUSES.includes(input.status)) return { ok: false, error: "bad status" };

  const supabase = await createClient();
  const { error } = await supabase.from("attendance").upsert(
    {
      session_id: input.session_id,
      student_id: input.student_id,
      status: input.status,
      flagged: input.status === "absent" || input.status === "late",
    },
    { onConflict: "session_id,student_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/checkin");
  return { ok: true };
}

// Clear a manually-set attendance row entirely (undo). RLS lets a coach delete
// rows for students in their own classes; admins can delete any.
export async function clearAttendanceAction(input: {
  session_id: string;
  student_id: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input?.session_id || !input?.student_id) return { ok: false, error: "missing" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("session_id", input.session_id)
    .eq("student_id", input.student_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/checkin");
  return { ok: true };
}

// Coach self-check-in: record (or undo) that the coach showed up to a session.
// coords (when the browser shares them) drive the geofence guard below.
export async function setCoachCheckin(input: {
  session_id: string;
  on: boolean;
  coords?: { lat: number; lng: number; accuracy?: number };
}): Promise<{ ok: boolean; error?: string }> {
  if (!input?.session_id) return { ok: false, error: "missing" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (input.on) {
    // Presence guard: only allow the self-check-in within the session's own time
    // window (60 min before start → 60 min after end, on the session date), so
    // "I'm here" can't be pressed from home the night before. The timestamp is
    // stored (checked_in_at) and cross-checked against a marked roster on the
    // admin coverage page — a check-in with no marks is the tell-tale of a fake.
    const { data: sess } = await createAdminClient()
      .from("sessions")
      .select("session_date, start_time, end_time, branch_id")
      .eq("id", input.session_id)
      .maybeSingle();
    if (sess?.session_date && sess.start_time && sess.end_time) {
      // Compare wall-clock (MYT) values in a common frame: treat both "now+8h"
      // and the session times as UTC ms.
      const nowMs = Date.now() + 8 * 3600 * 1000;
      const startMs = Date.parse(`${sess.session_date}T${sess.start_time}Z`) - 60 * 60000;
      const endMs = Date.parse(`${sess.session_date}T${sess.end_time}Z`) + 60 * 60000;
      if (Number.isFinite(startMs) && (nowMs < startMs || nowMs > endMs)) {
        return { ok: false, error: "You can only check in around the session time." };
      }
    }

    // Geofence guard: when the session's branch has a configured venue location,
    // the coach must be physically near it. We subtract the device's reported
    // accuracy so a fuzzy GPS fix doesn't produce a false rejection — reject only
    // when even the best-case position is outside the radius.
    const gf = await getBranchGeofence((sess as { branch_id?: string | null } | null)?.branch_id ?? null);
    const row: Record<string, unknown> = {
      session_id: input.session_id,
      coach_id: user.id,
      method: "self",
    };
    if (gf.enabled && gf.lat !== null && gf.lng !== null) {
      const c = input.coords;
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
        if (gf.required) {
          return {
            ok: false,
            error: "Turn on location to check in — the venue confirms you're on-site.",
          };
        }
        // Optional geofence + no fix: let it through, recorded as plain 'self'.
      } else {
        const dist = haversineMeters({ lat: gf.lat, lng: gf.lng }, { lat: c.lat, lng: c.lng });
        const slack = Number.isFinite(c.accuracy) ? Math.max(0, c.accuracy as number) : 0;
        if (dist - slack > gf.radiusM) {
          return {
            ok: false,
            error: `Too far from the venue (~${Math.round(dist)} m away). Move closer to check in.`,
          };
        }
        row.method = "self_geo";
        row.lat = c.lat;
        row.lng = c.lng;
        row.distance_m = Math.round(dist);
      }
    }

    const { error } = await supabase
      .from("coach_checkins")
      .upsert(row, { onConflict: "session_id,coach_id" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("coach_checkins")
      .delete()
      .eq("session_id", input.session_id)
      .eq("coach_id", user.id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/coach/checkin");
  return { ok: true };
}

export async function setPerfAction(input: {
  session_id: string;
  student_id: string;
  rating: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input?.session_id || !input?.student_id) return { ok: false, error: "missing" };
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "bad rating" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("session_marks").upsert(
    {
      session_id: input.session_id,
      student_id: input.student_id,
      coach_id: user?.id ?? null,
      rating: input.rating,
    },
    { onConflict: "session_id,student_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/checkin");
  return { ok: true };
}

// Bulk-marks the given student_ids as 'present' for the session in a single
// upsert. Used by the "Mark N present" speed button — only the row IDs the
// caller selects are touched.
export async function markAllPresentAction(input: {
  session_id: string;
  student_ids: string[];
}): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!input?.session_id || !Array.isArray(input.student_ids) || input.student_ids.length === 0) {
    return { ok: false, count: 0, error: "missing" };
  }
  const supabase = await createClient();
  const rows = input.student_ids.map((student_id) => ({
    session_id: input.session_id,
    student_id,
    status: "present" as const,
    flagged: false,
  }));
  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "session_id,student_id" });
  if (error) return { ok: false, count: 0, error: error.message };
  revalidatePath("/coach/checkin");
  return { ok: true, count: rows.length };
}

// ── Drop-ins ───────────────────────────────────────────────────────────────
// Add a student who isn't on the roster to a session happening now (a make-up,
// a sibling sitting in, a trial). Coach-gated, and the session must be one of
// the coach's own classes. Uses the service-role client because the attendance
// RLS only lets a coach write for students already enrolled in their classes —
// a drop-in is by definition not yet enrolled — so we authorize in code instead.

async function coachOwnsSession(meId: string, sessionId: string): Promise<boolean> {
  const authed = await createClient();
  const [classIds, { data: s }] = await Promise.all([
    coachClassIds(authed, meId),
    createAdminClient().from("sessions").select("class_id").eq("id", sessionId).maybeSingle(),
  ]);
  return !!s?.class_id && classIds.includes(s.class_id);
}

type AddableStudent = { id: string; full_name: string; photo_url: string | null };

export async function searchAddableStudentsAction(input: {
  session_id: string;
  q: string;
}): Promise<{ ok: boolean; students: AddableStudent[]; error?: string }> {
  const q = (input?.q ?? "").trim();
  if (!input?.session_id) return { ok: false, students: [], error: "missing" };
  if (q.length < 1) return { ok: true, students: [] };

  const me = await requireRole("coach");
  if (!(await coachOwnsSession(me.id, input.session_id))) {
    return { ok: false, students: [], error: "not your session" };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("students")
    .select("id, full_name, photo_url")
    .eq("status", "active")
    .ilike("full_name", `%${q}%`)
    .order("full_name")
    .limit(10);
  if (error) return { ok: false, students: [], error: error.message };
  return { ok: true, students: (data ?? []) as AddableStudent[] };
}

export async function addDropInAction(input: {
  session_id: string;
  student_id: string;
}): Promise<{ ok: boolean; student?: AddableStudent; error?: string }> {
  if (!input?.session_id || !input?.student_id) return { ok: false, error: "missing" };

  const me = await requireRole("coach");
  if (!(await coachOwnsSession(me.id, input.session_id))) {
    return { ok: false, error: "not your session" };
  }

  const db = createAdminClient();
  const { data: student, error: sErr } = await db
    .from("students")
    .select("id, full_name, photo_url")
    .eq("id", input.student_id)
    .maybeSingle();
  if (sErr || !student) return { ok: false, error: "student not found" };

  const { error } = await db.from("attendance").upsert(
    { session_id: input.session_id, student_id: input.student_id, status: "present", flagged: false },
    { onConflict: "session_id,student_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/checkin");
  return { ok: true, student: student as AddableStudent };
}
