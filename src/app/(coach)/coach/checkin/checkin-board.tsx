"use client";

import { useState, useTransition } from "react";
import { Avatar, Badge, Section, cn } from "@/components/ui";
import { useFlash } from "@/components/flash";
import { dict } from "@/lib/i18n";
import { Check, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { formatTime } from "@/lib/format";
import { haversineMeters } from "@/lib/geo";
import type { AttendanceStatus } from "@/lib/types";
import {
  setAttendanceAction, setPerfAction, markAllPresentAction,
  searchAddableStudentsAction, addDropInAction,
  clearAttendanceAction, setCoachCheckin,
} from "./board-actions";

export interface Roster {
  student: { id: string; full_name: string; photo_url?: string | null };
  att?: { status: AttendanceStatus; tap_in_at: string | null } | null;
  mark?: number | null;
  dropIn?: boolean;
}

export interface Block {
  session: {
    id: string;
    class_id: string;
    start_time: string;
    end_time: string;
    location: string | null;
    session_date?: string;
    grace_minutes?: number | null;
    classes?: { name: string | null } | null;
  };
  roster: Roster[];
  coachedIn?: boolean;
  // True when this coach is covering the session (approved coach-leave sub) —
  // renders a badge and, at some point, hints they're not the regular coach.
  covering?: boolean;
  // Trial leads who booked this session but aren't students yet — shown as a
  // read-only "expected" strip (no attendance row; they have no student id).
  trialGuests?: { child_name: string; experience: string | null }[];
  // Active check-in geofence for this session's branch (present only when the
  // branch has one configured). Drives the on-site status chip.
  geofence?: { lat: number | null; lng: number | null; radiusM: number; required: boolean };
}

type AddableStudent = { id: string; full_name: string; photo_url: string | null };

// Present is the one-tap green check on every row; the expanded panel only
// carries the exceptions so there are fewer buttons to scan.
const MARKS: { status: AttendanceStatus; label: string; on: string }[] = [
  { status: "late", label: "Late", on: "bg-amber-500 text-white" },
  { status: "absent", label: "Absent", on: "bg-red-600 text-white" },
  { status: "excused", label: "Excused", on: "bg-slate-600 text-white" },
];

// Best-effort device location for the check-in geofence. Resolves null on
// denial, timeout, insecure context, or unsupported browser — never throws, so
// a missing fix degrades to a server-side decision rather than a broken button.
function getCoords(): Promise<{ lat: number; lng: number; accuracy?: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

function fmtDist(m?: number): string {
  if (m == null) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

// On-site status chip beside "I'm here". Tap to (re)measure device location
// against the branch geofence. Idle → prompt; then coloured verdict.
function GeoChip({
  check,
  onCheck,
}: {
  check?: { state: "checking" | "ok" | "far" | "nofix"; distance?: number };
  onCheck: () => void;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors";
  if (!check) {
    return (
      <button type="button" onClick={onCheck} className={cn(base, "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50")}>
        📍 Check location
      </button>
    );
  }
  if (check.state === "checking") {
    return <span className={cn(base, "bg-white text-slate-500 ring-slate-300")}>📍 Checking…</span>;
  }
  const view = {
    ok: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: `On-site · ${fmtDist(check.distance)}` },
    far: { cls: "bg-red-50 text-red-700 ring-red-200", label: `Too far · ${fmtDist(check.distance)}` },
    nofix: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Location off" },
  }[check.state];
  return (
    <button type="button" onClick={onCheck} className={cn(base, view.cls)} title="Tap to re-check">
      📍 {view.label}
    </button>
  );
}

export function CheckinBoard({ initialBlocks, locale }: { initialBlocks: Block[]; locale?: string | null }) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const { flash, node } = useFlash();
  const L = dict(locale);
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Live geofence self-check per session (a one-tap "am I on-site?" test).
  const [geoChk, setGeoChk] = useState<
    Record<string, { state: "checking" | "ok" | "far" | "nofix"; distance?: number }>
  >({});

  // When a coach has more than one class today, show one session at a time.
  const [activeIdx, setActiveIdx] = useState(0);

  // Drop-in add panel (only one open at a time).
  const [addFor, setAddFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddableStudent[]>([]);
  const [searching, setSearching] = useState(false);

  const rowKey = (sId: string, stId: string) => `${sId}:${stId}`;

  function patchRow(sId: string, stId: string, patch: Partial<Roster>) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.session.id !== sId
          ? b
          : {
              ...b,
              roster: b.roster.map((r) => (r.student.id !== stId ? r : { ...r, ...patch })),
            },
      ),
    );
  }

  function setStatus(sId: string, stId: string, status: AttendanceStatus) {
    const key = rowKey(sId, stId);
    const snapshot = blocks;
    setBusy((b) => ({ ...b, [key]: true }));
    patchRow(sId, stId, { att: { status, tap_in_at: null } });
    startTransition(async () => {
      const r = await setAttendanceAction({ session_id: sId, student_id: stId, status });
      if (!r.ok) { setBlocks(snapshot); flash(L.save_fail); }
      setBusy((b) => {
        const next = { ...b };
        delete next[key];
        return next;
      });
    });
  }

  function clearStatus(sId: string, stId: string) {
    const key = rowKey(sId, stId);
    const snapshot = blocks;
    setBusy((b) => ({ ...b, [key]: true }));
    patchRow(sId, stId, { att: null });
    startTransition(async () => {
      const r = await clearAttendanceAction({ session_id: sId, student_id: stId });
      if (!r.ok) { setBlocks(snapshot); flash(L.save_fail); }
      setBusy((b) => {
        const next = { ...b };
        delete next[key];
        return next;
      });
    });
  }

  async function setCoach(sId: string, on: boolean) {
    const snapshot = blocks;
    setBlocks((prev) => prev.map((b) => (b.session.id !== sId ? b : { ...b, coachedIn: on })));
    // Capture the coach's location for the geofence when checking in. If the
    // browser can't/won't share it, we send nothing and the server decides
    // whether that's allowed (depends on GEOFENCE_REQUIRED).
    const coords = on ? await getCoords() : undefined;
    startTransition(async () => {
      const r = await setCoachCheckin({ session_id: sId, on, coords });
      if (!r.ok) {
        setBlocks(snapshot);
        flash(r.error ?? L.checkin_update_fail);
      }
    });
  }

  // One-tap "am I on-site?" check — reads the device location and measures it
  // against the branch geofence, entirely client-side, so a coach (or the client
  // testing on their phone) sees exactly where they stand before check-in.
  async function checkGeo(sId: string, gf: NonNullable<Block["geofence"]>) {
    if (gf.lat == null || gf.lng == null) return;
    setGeoChk((g) => ({ ...g, [sId]: { state: "checking" } }));
    const c = await getCoords();
    if (!c) {
      setGeoChk((g) => ({ ...g, [sId]: { state: "nofix" } }));
      return;
    }
    const dist = Math.round(haversineMeters({ lat: gf.lat, lng: gf.lng }, { lat: c.lat, lng: c.lng }));
    const ok = dist - (c.accuracy ?? 0) <= gf.radiusM;
    setGeoChk((g) => ({ ...g, [sId]: { state: ok ? "ok" : "far", distance: dist } }));
  }

  function setPerf(sId: string, stId: string, rating: number) {
    const snapshot = blocks;
    patchRow(sId, stId, { mark: rating });
    startTransition(async () => {
      const r = await setPerfAction({ session_id: sId, student_id: stId, rating });
      if (!r.ok) { setBlocks(snapshot); flash(L.save_fail); }
    });
  }

  function markAllRemaining(sId: string) {
    const block = blocks.find((b) => b.session.id === sId);
    if (!block) return;
    const unmarked = block.roster.filter((r) => !r.att).map((r) => r.student.id);
    if (!unmarked.length) return;
    const snapshot = blocks;
    setBlocks((prev) =>
      prev.map((b) =>
        b.session.id !== sId
          ? b
          : {
              ...b,
              roster: b.roster.map((r) =>
                unmarked.includes(r.student.id)
                  ? { ...r, att: { status: "present", tap_in_at: null } }
                  : r,
              ),
            },
      ),
    );
    startTransition(async () => {
      const r = await markAllPresentAction({ session_id: sId, student_ids: unmarked });
      if (!r.ok) { setBlocks(snapshot); flash(L.save_fail); }
    });
  }

  function toggleExpand(key: string) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  }

  function openAdd(sId: string) {
    setAddFor((cur) => (cur === sId ? null : sId));
    setQuery("");
    setResults([]);
  }
  function closeAdd() {
    setAddFor(null);
    setQuery("");
    setResults([]);
  }

  function runSearch(sId: string, text: string) {
    setQuery(text);
    const q = text.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    startTransition(async () => {
      const r = await searchAddableStudentsAction({ session_id: sId, q });
      setSearching(false);
      if (!r.ok) {
        setResults([]);
        return;
      }
      const block = blocks.find((b) => b.session.id === sId);
      const have = new Set((block?.roster ?? []).map((x) => x.student.id));
      setResults(r.students.filter((s) => !have.has(s.id)));
    });
  }

  function addDropIn(sId: string, student: AddableStudent) {
    // Optimistic: drop them onto the roster as present, then persist.
    setBlocks((prev) =>
      prev.map((b) =>
        b.session.id !== sId || b.roster.some((r) => r.student.id === student.id)
          ? b
          : { ...b, roster: [...b.roster, { student, att: { status: "present", tap_in_at: null }, mark: null, dropIn: true }] },
      ),
    );
    closeAdd();
    startTransition(async () => {
      const r = await addDropInAction({ session_id: sId, student_id: student.id });
      if (!r.ok) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.session.id !== sId ? b : { ...b, roster: b.roster.filter((x) => x.student.id !== student.id) },
          ),
        );
        flash(L.add_student_fail);
      }
    });
  }

  const idx = Math.min(activeIdx, blocks.length - 1);
  const visible = blocks.length > 1 ? [blocks[idx]] : blocks;

  return (
    <div className="space-y-4">
      {node}
      {blocks.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {blocks.map((b, i) => (
            <button
              key={b.session.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
                i === idx ? "bg-green-600 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {b.session.classes?.name ?? "Class"} · {formatTime(b.session.start_time)}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {visible.map(({ session, roster, coachedIn, covering, trialGuests, geofence }) => {
          const present = roster.filter(
            (r) => r.att && (r.att.status === "present" || r.att.status === "late"),
          ).length;
          const unmarked = roster.filter((r) => !r.att).length;
          return (
            <Section
              key={session.id}
              title={`${session.classes?.name ?? "Class"}${covering ? ` · ${L.cover_badge}` : ""}`}
              description={`${formatTime(session.start_time)}–${formatTime(session.end_time)} · ${
                session.location ?? "—"
              }`}
              flush
            >
              {/* Toolbar — coach status on the left, roster actions on the right,
                  full width so the buttons don't cram the title row on a phone. */}
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCoach(session.id, !coachedIn)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors",
                      coachedIn ? "bg-emerald-600 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                    )}
                    title="Record that you showed up to this session"
                  >
                    {coachedIn ? L.im_on_court : L.im_here}
                  </button>
                  {geofence && <GeoChip check={geoChk[session.id]} onCheck={() => checkGeo(session.id, geofence)} />}
                  <Badge tone={roster.length && present === roster.length ? "green" : "blue"}>
                    {present}/{roster.length} {L.present_word}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {unmarked > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllRemaining(session.id)}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800"
                    >
                      ✓ {L.mark_word} {unmarked} {L.present_word}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openAdd(session.id)}
                    aria-expanded={addFor === session.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> {L.add_student}
                  </button>
                </div>
              </div>
              {addFor === session.id && (
                <div className="border-b border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => runSearch(session.id, e.target.value)}
                      placeholder={L.search_add_placeholder}
                      className="h-9 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <button type="button" onClick={closeAdd} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {query.trim().length >= 1 && (
                    <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 bg-white">
                      {searching && <li className="px-3 py-2 text-sm text-slate-400">{L.searching}</li>}
                      {!searching && results.length === 0 && (
                        <li className="px-3 py-2 text-sm text-slate-400">{L.no_matches}</li>
                      )}
                      {results.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => addDropIn(session.id, s)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                          >
                            <Avatar name={s.full_name} src={s.photo_url} size={32} />
                            <span className="truncate text-sm font-medium text-slate-800">{s.full_name}</span>
                            <span className="ml-auto shrink-0 text-xs font-semibold text-green-600">{L.add_arrow} →</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {trialGuests && trialGuests.length > 0 && (
                <div className="border-b border-amber-100 bg-amber-50/70 px-4 py-2.5">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">{L.trial_guest_expected}</div>
                  <ul className="flex flex-wrap gap-1.5">
                    {trialGuests.map((g, i) => (
                      <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                        <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-bold uppercase text-amber-700">{L.trial_guest_tag}</span>
                        {g.child_name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {roster.map((r) => {
                  const cur = r.att?.status;
                  const key = rowKey(session.id, r.student.id);
                  const isExpanded = !!expanded[key];
                  const isBusy = !!busy[key];
                  return (
                    <li key={r.student.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.student.full_name} src={r.student.photo_url} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-900">
                            {r.student.full_name}
                            {r.dropIn && (
                              <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-emerald-700">
                                {L.dropin_word}
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              "text-xs font-medium",
                              cur === "present" ? "text-green-600"
                                : cur === "late" ? "text-amber-600"
                                : cur === "absent" ? "text-red-600"
                                : cur === "excused" ? "text-slate-500"
                                : "text-slate-400",
                            )}
                          >
                            {cur === "present" ? L.att_present
                              : cur === "late" ? L.att_late
                              : cur === "absent" ? L.att_absent
                              : cur === "excused" ? L.att_excused
                              : L.tap_mark_present}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setStatus(session.id, r.student.id, "present")}
                          disabled={isBusy}
                          aria-label="Mark present"
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            cur === "present"
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-slate-300 text-transparent hover:border-green-400 hover:text-green-300",
                            isBusy && "opacity-60",
                          )}
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleExpand(key)}
                          aria-expanded={isExpanded}
                          aria-label="More options"
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
                            isExpanded ? "border-green-300 bg-green-50 text-green-600" : "border-slate-200 text-slate-400 hover:bg-slate-50",
                            Boolean(r.mark) && !isExpanded && "text-amber-500",
                          )}
                        >
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="mt-2.5 space-y-2.5 border-t border-dashed border-slate-100 pl-12 pt-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {MARKS.map((m) => (
                              <button
                                key={m.status}
                                type="button"
                                onClick={() => setStatus(session.id, r.student.id, m.status)}
                                disabled={isBusy}
                                className={cn(
                                  "rounded-md px-3 py-2 text-xs font-medium ring-1 ring-inset transition-colors",
                                  cur === m.status ? `${m.on} ring-transparent` : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                                )}
                              >
                                {m.status === "late" ? L.att_late : m.status === "absent" ? L.att_absent : L.att_excused}
                              </button>
                            ))}
                            {cur && (
                              <button
                                type="button"
                                onClick={() => clearStatus(session.id, r.student.id)}
                                disabled={isBusy}
                                className="rounded-md px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-200 transition-colors hover:bg-red-50"
                                title="Remove this attendance mark"
                              >
                                {L.clear_word}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{L.rate_word}</span>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setPerf(session.id, r.student.id, n)}
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold ring-1 ring-inset transition-colors",
                                  r.mark === n ? "bg-green-600 text-white ring-transparent" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                                )}
                              >
                                {n}
                              </button>
                            ))}
                            <span className="ml-1 text-xs text-slate-400">{L.rate_hint}</span>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
                {roster.length === 0 && (
                  <li className="px-5 py-3 text-sm text-slate-400">{L.no_students_enrolled}</li>
                )}
              </ul>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
