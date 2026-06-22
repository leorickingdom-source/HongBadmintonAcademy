"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate, formatTime } from "@/lib/format";
import { rankBadgeClass, rankCardClass } from "@/lib/ranks";
import { buttonClass } from "@/components/ui";
import { cancelSession, restoreSession, removeSession } from "@/app/(admin)/admin/sessions/actions";

export interface CalendarSession {
  id: string;
  session_date: string; // YYYY-MM-DD
  start_time: string;
  end_time: string;
  location: string | null;
  status: string;
  className?: string | null;
  classRank?: string | null;
  coachName?: string | null;
}

// Tile tinted by class rank; canceled overrides to red + strikethrough.
function tone(rank: string | null | undefined, status: string): string {
  if (status === "canceled") return "border-red-300 bg-red-50 text-red-700";
  return rankCardClass(rank);
}

// A calendar session tile that opens a lightweight modal (no navigation) with
// the session's details and quick cancel/restore/delete. Deliberately omits the
// attendance / matrix / manage-class links.
export function SessionTile({ s }: { s: CalendarSession }) {
  const [open, setOpen] = useState(false);
  const canceled = s.status === "canceled";
  const rankPill = s.classRank ? (
    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-semibold " + rankBadgeClass(s.classRank)}>{s.classRank}</span>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${s.className ?? "Class"} · ${formatTime(s.start_time)}–${formatTime(s.end_time)} · ${s.status}`}
        className={"block w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow hover:shadow-sm " + tone(s.classRank, s.status) + (canceled ? " line-through opacity-70" : "")}
      >
        <div className="font-medium">{s.status === "completed" ? "✓ " : ""}{formatTime(s.start_time)}</div>
        <div className="truncate">{s.className ?? "Class"}</div>
        {s.classRank && (
          <span className={"mt-0.5 inline-flex rounded px-1 py-px text-[9px] font-bold uppercase leading-none " + rankBadgeClass(s.classRank)}>
            {s.classRank}
          </span>
        )}
        {s.coachName && <div className="mt-0.5 truncate text-[10px] text-slate-600">🎯 {s.coachName}</div>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{s.className ?? "Session"}</h2>
                {rankPill}
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
            </div>

            <div className="mt-3 space-y-1.5 text-sm text-slate-700">
              <div>📅 {formatDate(s.session_date)}</div>
              <div>🕐 {formatTime(s.start_time)}–{formatTime(s.end_time)}</div>
              <div>📍 {s.location ?? "—"}</div>
              <div>🎯 {s.coachName ?? "No coach"}</div>
              <div className="capitalize">Status: <span className="font-medium">{s.status}</span></div>
            </div>

            <Link
              href={`/admin/sessions/${s.id}`}
              onClick={() => setOpen(false)}
              className="mt-3 inline-flex text-sm font-medium text-green-700 hover:underline"
            >
              View roster &amp; attendance →
            </Link>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {canceled ? (
                <form action={restoreSession}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={buttonClass("secondary")}>Restore session</button>
                </form>
              ) : (
                <form action={cancelSession}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={buttonClass("secondary")}>Cancel &amp; notify parents</button>
                </form>
              )}
              <form action={removeSession}>
                <input type="hidden" name="id" value={s.id} />
                <button
                  type="submit"
                  className={buttonClass("danger")}
                  onClick={(e) => {
                    if (!window.confirm("Delete this session? This cannot be undone.")) e.preventDefault();
                  }}
                >
                  Delete
                </button>
              </form>
            </div>
            {!canceled && (
              <p className="mt-2 text-xs text-slate-400">Cancelling queues a WhatsApp notice to enrolled students&apos; parents.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
