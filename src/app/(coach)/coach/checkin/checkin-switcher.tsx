"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hand, ClipboardList, Tablet } from "lucide-react";
import { Avatar, cn } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { CheckinBoard, type Block } from "./checkin-board";
import { setAttendanceAction } from "./board-actions";

const isIn = (s?: string | null) => s === "present" || s === "late";

// Self-tap respects the class's grace window: tapping after start + grace_minutes
// marks "late", otherwise "present" — the NFC rule, applied to kiosk taps too.
function lateOrPresent(session: Block["session"]): "present" | "late" {
  if (!session.session_date || session.grace_minutes == null) return "present";
  const start = new Date(`${session.session_date}T${session.start_time}`);
  if (Number.isNaN(start.getTime())) return "present";
  return Date.now() > start.getTime() + session.grace_minutes * 60000 ? "late" : "present";
}

// One Check-in page, two modes: the coach board (NFC + manual marking) and a
// court-side Kiosk where students tap their own name. Replaces the separate
// Kiosk route.
export function CheckinSwitcher({ blocks }: { blocks: Block[] }) {
  const [mode, setMode] = useState<"board" | "kiosk">("board");
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode("board")}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors", mode === "board" ? "bg-green-600 text-white" : "text-slate-600 hover:bg-slate-50")}
        >
          <ClipboardList className="h-4 w-4" /> Coach board
        </button>
        <button
          type="button"
          onClick={() => setMode("kiosk")}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors", mode === "kiosk" ? "bg-green-600 text-white" : "text-slate-600 hover:bg-slate-50")}
        >
          <Tablet className="h-4 w-4" /> Kiosk mode
        </button>
      </div>

      {mode === "board" ? (
        <CheckinBoard initialBlocks={blocks} />
      ) : (
        <KioskMode blocks={blocks} />
      )}
    </div>
  );
}

function KioskMode({ blocks }: { blocks: Block[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function tap(session: Block["session"], studentId: string) {
    const key = `${session.id}:${studentId}`;
    if (pending.has(key)) return;
    setPending((p) => new Set(p).add(key));
    const status = lateOrPresent(session);
    startTransition(async () => {
      await setAttendanceAction({ session_id: session.id, student_id: studentId, status });
      router.refresh();
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Leave this open on a court-side tablet — students tap their own name. Taps after the grace window are marked late automatically.
      </p>
      {blocks.map(({ session, roster }) => {
        const inCount = roster.filter((r) => isIn(r.att?.status)).length;
        return (
          <div key={session.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{session.classes?.name ?? "Class"}</div>
                <div className="text-sm text-slate-500">
                  {formatTime(session.start_time)}–{formatTime(session.end_time)}{session.location ? ` · ${session.location}` : ""}
                </div>
              </div>
              <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                {inCount} of {roster.length} in
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {roster.map((r) => {
                const checked = isIn(r.att?.status);
                const busy = pending.has(`${session.id}:${r.student.id}`);
                return (
                  <button
                    key={r.student.id}
                    type="button"
                    onClick={() => !checked && tap(session, r.student.id)}
                    disabled={checked || busy}
                    className={cn(
                      "flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-colors",
                      checked ? "border-green-200 bg-green-50" : "border-slate-200 bg-white hover:border-green-300 hover:bg-green-50/40 active:scale-[0.98]",
                      busy && "opacity-60",
                    )}
                  >
                    <Avatar name={r.student.full_name} src={(r.student as any).photo_url} size={56} className={checked ? "ring-2 ring-green-200" : ""} />
                    <span className="text-sm font-semibold text-slate-900">{r.student.full_name}</span>
                    {checked ? (
                      <span className={cn("text-xs font-medium", r.att?.status === "late" ? "text-amber-600" : "text-green-700")}>
                        {r.att?.status === "late" ? "Late" : "Checked in"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Hand className="h-3.5 w-3.5" />{busy ? "Checking in…" : "Tap to check in"}
                      </span>
                    )}
                  </button>
                );
              })}
              {roster.length === 0 && <p className="col-span-full py-2 text-sm text-slate-400">No students enrolled.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
