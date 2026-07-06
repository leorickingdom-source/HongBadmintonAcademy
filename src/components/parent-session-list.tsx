"use client";

import { useState, useTransition } from "react";
import { Clock, MapPin, User, Users, ChevronDown, Star, CalendarCheck, CalendarX } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import { requestLeave, cancelLeave } from "@/app/(parent)/parent/schedule/leave-actions";
import { dict } from "@/lib/i18n";

export type SessionKid = { name: string; status: string | null; tapIn: string | null; rating: number | null };
// Upcoming rows can carry the parent's kids with their leave state so the row
// can offer "Request leave" per child.
export type UpcomingKid = { id: string; name: string; leave: "pending" | "approved" | "declined" | null; makeup?: string | null };
export type SessionItem = {
  id: string;
  kind: "upcoming" | "past";
  mon: string;
  day: number;
  wd: string;
  timeLabel: string;
  fullDate: string;
  location: string | null;
  className: string;
  coach: string | null;
  status: string;
  who: string[];
  kids: SessionKid[];
  upKids?: UpcomingKid[];
};

const ATT_TONE: Record<string, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};
const LEAVE_TONE: Record<string, "green" | "yellow" | "red"> = {
  approved: "green", pending: "yellow", declined: "red",
};

// Tap a session row to expand it. Upcoming → logistics (coach, who, date) plus
// per-child leave requests. Past → each child's attendance, tap-in and mark.
export function ParentSessionList({ sessions, locale }: { sessions: SessionItem[]; locale?: string | null }) {
  const L = dict(locale);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState(sessions);
  const [leaveFor, setLeaveFor] = useState<string | null>(null); // `${sessionId}:${kidId}`
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function patchKid(sessionId: string, kidId: string, leave: UpcomingKid["leave"]) {
    setItems((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : { ...s, upKids: (s.upKids ?? []).map((k) => (k.id !== kidId ? k : { ...k, leave })) },
      ),
    );
  }

  function submitLeave(sessionId: string, kidId: string) {
    setBusy(true);
    const prev = items;
    patchKid(sessionId, kidId, "pending");
    setLeaveFor(null);
    const attach = file;
    startTransition(async () => {
      const r = await requestLeave({ session_id: sessionId, student_id: kidId, reason, file: attach });
      if (!r.ok) setItems(prev);
      setReason("");
      setFile(null);
      setBusy(false);
    });
  }

  function withdraw(sessionId: string, kidId: string) {
    setBusy(true);
    const prev = items;
    patchKid(sessionId, kidId, null);
    startTransition(async () => {
      const r = await cancelLeave({ session_id: sessionId, student_id: kidId });
      if (!r.ok) setItems(prev);
      setBusy(false);
    });
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((s) => {
        const isOpen = open === s.id;
        const upcoming = s.kind === "upcoming";
        return (
          <li key={s.id}>
            <button
              onClick={() => setOpen(isOpen ? null : s.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
            >
              <div className={cn("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl", upcoming ? "bg-emerald-50" : "bg-slate-100")}>
                <span className={cn("text-[10px] font-semibold uppercase tracking-wide", upcoming ? "text-emerald-600" : "text-slate-500")}>{s.mon}</span>
                <span className={cn("text-xl font-bold leading-none", upcoming ? "text-emerald-800" : "text-slate-700")}>{s.day}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{s.className}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.wd} {s.timeLabel}</span>
                  {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</span>}
                </div>
              </div>
              {s.status === "canceled" && <Badge tone="red">{L.canceled}</Badge>}
              {upcoming && (s.upKids ?? []).some((k) => k.leave) && (
                <Badge tone={LEAVE_TONE[(s.upKids ?? []).find((k) => k.leave)!.leave!] ?? "slate"}>
                  {L[`leave_${(s.upKids ?? []).find((k) => k.leave)!.leave!}` as "leave_pending"]}
                </Badge>
              )}
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
              <div className="space-y-2 bg-slate-50 px-4 py-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600"><CalendarCheck className="h-4 w-4 text-slate-400" />{s.fullDate}</div>
                {s.coach && <div className="flex items-center gap-2 text-slate-600"><User className="h-4 w-4 text-slate-400" />{L.coach_label} {s.coach}</div>}

                {upcoming ? (
                  <>
                    {s.who.length > 0 && (
                      <div className="flex items-center gap-2 text-slate-600"><Users className="h-4 w-4 text-slate-400" />{s.who.join(", ")}</div>
                    )}
                    {(s.upKids ?? []).length > 0 && s.status !== "canceled" && (
                      <div className="space-y-2 border-t border-slate-200 pt-2">
                        {(s.upKids ?? []).map((k) => {
                          const key = `${s.id}:${k.id}`;
                          return (
                            <div key={k.id} className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-900">{k.name}</span>
                                {k.leave ? (
                                  <>
                                    <Badge tone={LEAVE_TONE[k.leave] ?? "slate"}>{L[`leave_${k.leave}` as "leave_pending"]}</Badge>
                                    {k.leave === "approved" && k.makeup && (
                                      <span className="text-xs font-medium text-emerald-700">{L.makeup_label}: {k.makeup}</span>
                                    )}
                                    {k.leave === "pending" && (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => withdraw(s.id, k.id)}
                                        className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                                      >
                                        {L.withdraw}
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => { setLeaveFor(leaveFor === key ? null : key); setReason(""); }}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                  >
                                    <CalendarX className="h-3.5 w-3.5" /> {L.request_leave}
                                  </button>
                                )}
                              </div>
                              {leaveFor === key && (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      autoFocus
                                      value={reason}
                                      onChange={(e) => setReason(e.target.value)}
                                      placeholder={L.reason_placeholder}
                                      maxLength={300}
                                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500"
                                    />
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => submitLeave(s.id, k.id)}
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                                    >
                                      {L.send_request}
                                    </button>
                                  </div>
                                  <label className="flex items-center gap-2 text-xs text-slate-500">
                                    <span className="shrink-0">{L.attachment}</span>
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp,application/pdf"
                                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                                      className="min-w-0 flex-1 text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-slate-600"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : s.kids.length === 0 ? (
                  <div className="text-slate-400">{L.no_attendance}</div>
                ) : (
                  s.kids.map((k, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{k.name}</span>
                      {k.status ? <Badge tone={ATT_TONE[k.status] ?? "slate"}>{k.status}</Badge> : <span className="text-slate-400">{L.not_marked}</span>}
                      {k.tapIn && <span className="text-xs text-slate-500">{L.tapped} {k.tapIn}</span>}
                      {k.rating != null && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Star className="h-3.5 w-3.5" />{k.rating}/5</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
