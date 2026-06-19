"use client";

import { useState, useTransition } from "react";
import { Badge, Section, cn } from "@/components/ui";
import { formatTime, formatDateTime } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/types";
import { setAttendanceAction, setPerfAction, markAllPresentAction } from "./board-actions";

export interface Roster {
  student: { id: string; full_name: string; photo_url?: string | null };
  att?: { status: AttendanceStatus; tap_in_at: string | null } | null;
  mark?: number | null;
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
}

const TONE: Record<AttendanceStatus, "green" | "yellow" | "red" | "slate"> = {
  present: "green",
  late: "yellow",
  absent: "red",
  excused: "slate",
};

const MARKS: { status: AttendanceStatus; label: string; on: string }[] = [
  { status: "present", label: "Present", on: "bg-green-600 text-white" },
  { status: "late", label: "Late", on: "bg-amber-500 text-white" },
  { status: "absent", label: "Absent", on: "bg-red-600 text-white" },
  { status: "excused", label: "Excused", on: "bg-slate-600 text-white" },
];

export function CheckinBoard({ initialBlocks }: { initialBlocks: Block[] }) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

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
      if (!r.ok) setBlocks(snapshot);
      setBusy((b) => {
        const next = { ...b };
        delete next[key];
        return next;
      });
    });
  }

  function setPerf(sId: string, stId: string, rating: number) {
    const snapshot = blocks;
    patchRow(sId, stId, { mark: rating });
    startTransition(async () => {
      const r = await setPerfAction({ session_id: sId, student_id: stId, rating });
      if (!r.ok) setBlocks(snapshot);
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
      if (!r.ok) setBlocks(snapshot);
    });
  }

  function toggleExpand(key: string) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  }

  return (
    <div className="space-y-6">
      {blocks.map(({ session, roster }) => {
        const present = roster.filter(
          (r) => r.att && (r.att.status === "present" || r.att.status === "late"),
        ).length;
        const unmarked = roster.filter((r) => !r.att).length;
        return (
          <Section
            key={session.id}
            title={session.classes?.name ?? "Class"}
            description={`${formatTime(session.start_time)}–${formatTime(session.end_time)} · ${
              session.location ?? "—"
            }`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={roster.length && present === roster.length ? "green" : "blue"}>
                  {present}/{roster.length} present
                </Badge>
                {unmarked > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllRemaining(session.id)}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800"
                  >
                    ✓ Mark {unmarked} present
                  </button>
                )}
              </div>
            }
            flush
          >
            <ul className="divide-y divide-slate-100">
              {roster.map((r) => {
                const cur = r.att?.status;
                const key = rowKey(session.id, r.student.id);
                const isExpanded = !!expanded[key];
                const isBusy = !!busy[key];
                return (
                  <li key={r.student.id} className="px-5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-slate-700">
                          {r.student.full_name}
                        </span>
                        {cur ? (
                          <Badge tone={TONE[cur]}>{cur}</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">unmarked</span>
                        )}
                        {r.att?.tap_in_at && (
                          <span className="text-xs text-slate-400">
                            {formatDateTime(r.att.tap_in_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {MARKS.map((m) => (
                          <button
                            key={m.status}
                            type="button"
                            onClick={() => setStatus(session.id, r.student.id, m.status)}
                            disabled={isBusy}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                              cur === m.status
                                ? `${m.on} ring-transparent`
                                : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                              isBusy && "opacity-60",
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => toggleExpand(key)}
                          className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                          aria-expanded={isExpanded}
                        >
                          {r.mark ? `★ ${r.mark}/5` : "Rate"} {isExpanded ? "▴" : "▾"}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-100 pt-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Perf
                        </span>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setPerf(session.id, r.student.id, n)}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ring-1 ring-inset transition-colors",
                              r.mark === n
                                ? "bg-green-600 text-white ring-transparent"
                                : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                            )}
                          >
                            {n}
                          </button>
                        ))}
                        <span className="ml-1 text-xs text-slate-400">
                          1 = needs work · 5 = excellent
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
              {roster.length === 0 && (
                <li className="px-5 py-3 text-sm text-slate-400">No students enrolled.</li>
              )}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}
