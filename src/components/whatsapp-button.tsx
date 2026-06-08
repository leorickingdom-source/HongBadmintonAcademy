"use client";

import { useRef } from "react";
import { buttonClass } from "@/components/ui";

// A real anchor (reliably opens WhatsApp via wa.me, no popup-blocker issues).
// On click it also fires the server action to log the send. Disabled when the
// parent has no phone on file.
export function WhatsAppButton({
  waUrl,
  action,
  fields,
  label = "Send on WhatsApp",
}: {
  waUrl: string | null;
  action: (formData: FormData) => void;
  fields: Record<string, string>;
  label?: string;
}) {
  const logged = useRef(false);

  if (!waUrl) {
    return <span className="text-xs text-slate-400">No phone</span>;
  }

  return (
    <a
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClass("secondary")}
      onClick={() => {
        if (logged.current) return;
        logged.current = true;
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.append(k, v);
        void action(fd); // fire-and-forget: record in the message log
      }}
    >
      {label}
    </a>
  );
}
