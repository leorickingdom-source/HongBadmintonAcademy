import Link from "next/link";
import { MapPin } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, EmptyState } from "@/components/ui";
import { dict } from "@/lib/i18n";
import { coachClassIds, coachCoverSessionIds } from "../_data";
import { getBranchGeofence, type Geofence } from "@/lib/geofence";
import { NfcScanner } from "@/components/nfc-scanner";
import { scanTap } from "./actions";
import { type Block } from "./checkin-board";
import { CheckinSwitcher } from "./checkin-switcher";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const me = await requireRole("coach");
  const L = dict(me.locale);
  const supabase = await createClient();
  const [classIds, coverSessionIds] = await Promise.all([
    coachClassIds(supabase, me.id),
    coachCoverSessionIds(supabase, me.id),
  ]);
  const today = new Date().toLocaleDateString("en-CA");

  // Own-class sessions today PLUS sessions the coach is covering today (via an
  // approved coach-leave replacement). Two queries so RLS resolves each set
  // through its correct predicate.
  const [{ data: ownSess }, { data: coverSess }] = await Promise.all([
    classIds.length
      ? supabase
          .from("sessions")
          .select("id, class_id, session_date, start_time, end_time, location, grace_minutes, branch_id, classes(name)")
          .in("class_id", classIds)
          .eq("session_date", today)
          .order("start_time")
      : Promise.resolve({ data: [] as any[] }),
    coverSessionIds.length
      ? supabase
          .from("sessions")
          .select("id, class_id, session_date, start_time, end_time, location, grace_minutes, branch_id, classes(name)")
          .in("id", coverSessionIds)
          .eq("session_date", today)
          .order("start_time")
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const coverSet = new Set(coverSessionIds);
  const combined = [...(ownSess ?? []), ...(coverSess ?? [])];
  // Dedupe (a coach who is somehow both class-coach and replacement — shouldn't
  // happen, but keep it defensive).
  const seenIds = new Set<string>();
  const sessions = combined.filter((s: any) => {
    if (seenIds.has(s.id)) return false;
    seenIds.add(s.id);
    return true;
  });

  // Which of today's sessions the coach has checked into (showed up for).
  const sessIds = (sessions ?? []).map((s: any) => s.id);
  const { data: coachIns } = sessIds.length
    ? await supabase.from("coach_checkins").select("session_id").eq("coach_id", me.id).in("session_id", sessIds)
    : { data: [] as any[] };
  const coachedSet = new Set((coachIns ?? []).map((c: any) => c.session_id));

  // Trial leads booked into any of TODAY's sessions the coach is running.
  // trial_leads is admin-only under RLS, so read via the service-role client
  // but scope strictly to this coach's own session ids — no cross-coach leakage.
  const guestsBySession = new Map<string, { child_name: string; experience: string | null }[]>();
  if (sessIds.length) {
    const admin = createAdminClient();
    const { data: guests } = await admin
      .from("trial_leads")
      .select("preferred_session_id, child_name, experience")
      .in("preferred_session_id", sessIds)
      .is("converted_student_id", null)
      .order("created_at");
    for (const g of (guests ?? []) as any[]) {
      const arr = guestsBySession.get(g.preferred_session_id) ?? [];
      arr.push({ child_name: g.child_name, experience: g.experience });
      guestsBySession.set(g.preferred_session_id, arr);
    }
  }

  // Resolve each session's branch geofence once per distinct branch, so the
  // coach board can show live "on-site / too far" status client-side.
  const geoByBranch = new Map<string, Geofence>();
  for (const bId of new Set((sessions ?? []).map((s: any) => s.branch_id).filter(Boolean) as string[])) {
    geoByBranch.set(bId, await getBranchGeofence(bId));
  }

  const blocks: Block[] = [];
  for (const s of sessions ?? []) {
    const [{ data: enr }, { data: att }, { data: marks }, { data: makeups }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("students(id, full_name, photo_url)")
        .eq("class_id", s.class_id)
        .eq("active", true),
      supabase
        .from("attendance")
        .select("student_id, status, tap_in_at")
        .eq("session_id", s.id),
      supabase
        .from("session_marks")
        .select("student_id, rating")
        .eq("session_id", s.id),
      // Students booked into THIS session as an approved makeup for a leave.
      supabase
        .from("leave_requests")
        .select("students(id, full_name, photo_url)")
        .eq("makeup_session_id", s.id)
        .eq("status", "approved"),
    ]);
    const attMap = new Map((att ?? []).map((a: any) => [a.student_id, a]));
    const markMap = new Map((marks ?? []).map((m: any) => [m.student_id, m.rating as number]));
    const roster = (enr ?? [])
      .map((e: any) => ({
        student: e.students,
        att: attMap.get(e.students?.id) ?? null,
        mark: markMap.get(e.students?.id) ?? null,
      }))
      .filter((r: any) => r.student);
    // Append makeup students not already on the roster, flagged like drop-ins.
    const have = new Set(roster.map((r: any) => r.student.id));
    for (const m of (makeups ?? []) as any[]) {
      const st = m.students;
      if (!st || have.has(st.id)) continue;
      roster.push({
        student: st,
        att: attMap.get(st.id) ?? null,
        mark: markMap.get(st.id) ?? null,
        dropIn: true,
      } as any);
    }
    const gf = s.branch_id ? geoByBranch.get(s.branch_id) : undefined;
    blocks.push({
      session: s as any,
      roster: roster as any,
      coachedIn: coachedSet.has(s.id),
      covering: coverSet.has(s.id),
      trialGuests: guestsBySession.get(s.id) ?? [],
      geofence: gf && gf.enabled ? { lat: gf.lat, lng: gf.lng, radiusM: gf.radiusM, required: gf.required } : undefined,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.coach_checkin_title}
        description={L.coach_checkin_desc}
      />

      {blocks.length === 0 ? (
        <EmptyState message={L.no_sessions_today} />
      ) : (
        <CheckinSwitcher blocks={blocks} locale={me.locale} nfc={<NfcScanner action={scanTap} />} />
      )}

      {blocks.some((b) => b.geofence) && (
        <Link
          href="/coach/checkin/geo-check"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
        >
          <MapPin className="h-4 w-4" /> Test my location
        </Link>
      )}
    </div>
  );
}
