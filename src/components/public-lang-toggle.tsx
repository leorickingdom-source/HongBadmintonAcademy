import { setPublicLocale } from "@/app/public-locale-actions";

// Tiny EN/中文 toggle for pre-auth pages. A plain server-action form button:
// clicking flips to the other language, sets the cookie, and the page re-renders.
export function PublicLangToggle({ locale }: { locale: string }) {
  const next = locale === "zh" ? "en" : "zh";
  return (
    <form action={setPublicLocale}>
      <button
        type="submit"
        name="locale"
        value={next}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        {locale === "zh" ? "EN" : "中文"}
      </button>
    </form>
  );
}
