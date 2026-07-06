"use client";

import { Languages } from "lucide-react";
import { toggleParentLocale } from "@/app/(parent)/parent/account/locale-actions";

// Persistent EN ⇄ 中文 toggle for the parent shell. Shows the language you'd
// switch TO. Stays on the current page (the action doesn't redirect).
export function LangToggle({ locale }: { locale: string | null }) {
  const isZh = locale === "zh";
  return (
    <form action={toggleParentLocale}>
      <input type="hidden" name="locale" value={isZh ? "en" : "zh"} />
      <button
        type="submit"
        aria-label="Switch language"
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
      >
        <Languages className="h-3.5 w-3.5" />
        {isZh ? "EN" : "中文"}
      </button>
    </form>
  );
}
