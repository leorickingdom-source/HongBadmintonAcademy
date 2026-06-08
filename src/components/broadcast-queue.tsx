"use client";

import { useState } from "react";
import { buttonClass, Card, Badge, EmptyState } from "@/components/ui";

export interface BroadcastItem {
  id: string;
  name: string;
  phone: string | null;
  waUrl: string | null;
  body: string;
  fields: Record<string, string>;
}

// A click-to-chat broadcast queue: a prominent "Send next" walks through every
// recipient (opens their pre-filled WhatsApp chat + advances), plus a full list
// for ad-hoc sending. Each send is logged via the server action. No Meta API.
export function BroadcastQueue({
  items,
  action,
  emptyLabel,
}: {
  items: BroadcastItem[];
  action: (formData: FormData) => void;
  emptyLabel: string;
}) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  if (items.length === 0) return <EmptyState message={emptyLabel} />;

  const sendable = items.filter((i) => i.waUrl);
  const noPhone = items.length - sendable.length;
  const doneCount = sendable.filter((i) => done[i.id]).length;
  const next = sendable.find((i) => !done[i.id]) ?? null;

  function markSent(item: BroadcastItem) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(item.fields)) fd.append(k, v);
    void action(fd); // log the send (fire-and-forget)
    setDone((d) => ({ ...d, [item.id]: true }));
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-sm text-slate-500">Progress</div>
          <div className="text-2xl font-semibold text-slate-900">
            {doneCount} / {sendable.length} sent
          </div>
          {noPhone > 0 && (
            <div className="mt-1 text-xs text-amber-600">
              {noPhone} recipient(s) have no phone — add one to message them.
            </div>
          )}
        </div>
        {next ? (
          <a
            href={next.waUrl!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => markSent(next)}
            className={buttonClass("primary", "text-base")}
          >
            Send next → {next.name}
          </a>
        ) : (
          <Badge tone="green">All sent ✓</Badge>
        )}
      </Card>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {items.map((i) => {
            const isDone = !!done[i.id];
            return (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{i.name}</span>
                    {isDone && <Badge tone="green">sent</Badge>}
                  </div>
                  <div className="truncate text-xs text-slate-400" title={i.body}>
                    {i.phone ?? "no phone"} · {i.body.replace(/\n/g, "  ")}
                  </div>
                </div>
                {i.waUrl ? (
                  <a
                    href={i.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markSent(i)}
                    className={buttonClass(isDone ? "ghost" : "secondary")}
                  >
                    {isDone ? "Resend" : "Send"}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">No phone</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
