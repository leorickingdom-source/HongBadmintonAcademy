"use client";

import { useState } from "react";
import { buttonClass, Textarea, Field } from "@/components/ui";

// Worker-free community announcement: compose a notice, copy it, paste it once
// into the WhatsApp Community Announcements group by hand, then log it for the
// record. No bot, no per-parent blast, no ban risk — a human posts it.
export function AnnounceComposer({
  action,
  communityLink,
}: {
  action: (formData: FormData) => void;
  communityLink: string | null;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [logged, setLogged] = useState(false);
  const trimmed = text.trim();

  async function copy() {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — admin can select the text and copy manually */
    }
  }

  function logPosted() {
    const fd = new FormData();
    fd.append("text", trimmed);
    void action(fd); // fire-and-forget log; row appears on next page load
    setLogged(true);
  }

  return (
    <div className="space-y-4">
      <Field
        label="Message"
        hint="Goes to the whole community — don't put private info (fees, scores, a child's name) here."
      >
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setLogged(false);
          }}
          placeholder="e.g. No class this Saturday 14 June (public holiday). Normal schedule resumes Monday. Bring a water bottle 🏸"
        />
      </Field>

      <ol className="list-inside space-y-1 text-sm text-slate-600">
        <li><b>1.</b> Write the notice above.</li>
        <li><b>2.</b> Tap <b>Copy text</b>.</li>
        <li><b>3.</b> Open the community <b>Announcements</b> group, paste, send.</li>
        <li><b>4.</b> Tap <b>Mark as posted</b> here for your records.</li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!trimmed}
          onClick={copy}
          className={buttonClass("primary")}
        >
          {copied ? "Copied ✓" : "Copy text"}
        </button>

        {communityLink && (
          <a
            href={communityLink}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("secondary")}
          >
            Open Announcements group →
          </a>
        )}

        <button
          type="button"
          disabled={!trimmed || logged}
          onClick={logPosted}
          className={buttonClass("secondary")}
        >
          {logged ? "Logged ✓" : "Mark as posted"}
        </button>
      </div>
    </div>
  );
}
