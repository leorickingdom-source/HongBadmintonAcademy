"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Hand } from "lucide-react";
import { Avatar, cn } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { setAttendanceAction } from "../checkin/board-actions";

interface Roster {
  student: { id: string; full_name: string };
  att: { status: string; tap_in_at: string | null } | null;
}
export interface KioskBlock {
  session: { id: string; start_time: string; end_time: string; location: string | null; classes: { name: string } | null };
  roster: Roster[];
}

const isIn = (status?: string | null) => status === "present" || status === "late";

export function KioskBoard({ initialBlocks }: { initialBlocks: KioskBlock[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(initialBlocks[0]?.session.id);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const block = initialBlocks.find((b) => b.session.id === activeId) ?? initialBlocks[0];
  const inCount = block.roster.filter((r) => isIn(r.att?.status)).length;

  function checkIn(studentId: string) {
    if (pending.has(studentId)) return;
    setPending((p) => new Set(p).add(studentId));
    startTransition(async () => {
      await setAttendanceAction({ session_id: block.session.id, student_id: studentId, status: "present" });
      router.refresh();
      setPending((p) => {
        const n = new Set(p);
        n.delete(studentId);
        return n;
      });
    });
  }

  return (
    <div className="space-y-4">
      {initialBlocks.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {initialBlocks.map((b) => (
            <button
              key={b.session.id}
              onClick={() => setActiveId(b.session.id)}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                b.session.id === activeId ? "bg-green-600 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
              )}
            >
              {b.session.classes?.name ?? "Class"} · {formatTime(b.session.start_time)}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-slate-900">{block.session.classes?.name ?? "Class"}</div>
            <div className="text-sm text-slate-500">
              {formatTime(block.session.start_time)}–{formatTime(block.session.end_time)}
              {block.session.location ? ` · ${block.session.location}` : ""}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            <Check className="h-4 w-4" />
            {inCount} of {block.roster.length} in
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {block.roster.map((r) => {
            const checked = isIn(r.att?.status);
            const busy = pending.has(r.student.id);
            return (
              <button
                key={r.student.id}
                onClick={() => !checked && checkIn(r.student.id)}
                disabled={checked || busy}
                className={cn(
                  "flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-colors",
                  checked
                    ? "border-green-200 bg-green-50"
                    : "border-slate-200 bg-white hover:border-green-300 hover:bg-green-50/40 active:scale-[0.98]",
                  busy && "opacity-60",
                )}
              >
                <Avatar name={r.student.full_name} size={56} className={checked ? "ring-2 ring-green-200" : ""} />
                <span className="text-sm font-semibold text-slate-900">{r.student.full_name}</span>
                {checked ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <Check className="h-3.5 w-3.5" />
                    Checked in
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Hand className="h-3.5 w-3.5" />
                    {busy ? "Checking in…" : "Tap to check in"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
