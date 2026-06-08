"use client";

import { SubmitButton } from "@/components/submit-button";

// Opens WhatsApp (wa.me) with the pre-filled message in a new tab, and logs
// the send to the message log via the server action. Disabled when the parent
// has no phone on file.
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
  if (!waUrl) {
    return <span className="text-xs text-slate-400">No phone</span>;
  }
  return (
    <form action={action} onSubmit={() => window.open(waUrl, "_blank", "noopener")}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant="secondary" pendingText="Opening…">
        {label}
      </SubmitButton>
    </form>
  );
}
