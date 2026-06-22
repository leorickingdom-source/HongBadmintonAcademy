"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/components/ui";
import { markAllReadAction, markReadAction, setMutedAction } from "@/app/notifications/actions";
import type { Notification } from "@/lib/notifications";

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function NotificationBell({
  items,
  unread,
  muted,
}: {
  items: Notification[];
  unread: number;
  muted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) run(() => markAllReadAction()); // seen on open
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-50"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-800">Notifications</span>
              <button
                type="button"
                onClick={() => run(() => setMutedAction(!muted))}
                className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  You&apos;re all caught up.
                </div>
              ) : (
                items.map((n) => {
                  const inner = (
                    <div
                      className={cn(
                        "flex gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50",
                        !n.read_at && "bg-green-50/50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          n.read_at ? "bg-transparent" : "bg-green-500",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">{n.title}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{ago(n.created_at)}</span>
                        </div>
                        {n.body && <p className="mt-0.5 text-xs leading-snug text-slate-500">{n.body}</p>}
                      </div>
                    </div>
                  );
                  return n.url ? (
                    <Link
                      key={n.id}
                      href={n.url}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read_at) run(() => markReadAction(n.id));
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })
              )}
            </div>

            {muted && (
              <div className="border-t border-slate-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-700">
                Muted — new alerts won&apos;t appear here until you unmute.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
