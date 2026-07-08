import "server-only";
import { cookies, headers } from "next/headers";
import { normalizeLocale, type Locale } from "@/lib/i18n";

// Locale for PRE-AUTH public pages (login, /trial, parent-login) where there is
// no profile yet. Priority: an explicit cookie the visitor set via the toggle,
// else the browser's Accept-Language (zh* → Chinese), else English.
export const PUBLIC_LANG_COOKIE = "hba_lang";

export async function getPublicLocale(): Promise<Locale> {
  const c = (await cookies()).get(PUBLIC_LANG_COOKIE)?.value;
  if (c === "zh" || c === "en") return normalizeLocale(c);
  const al = ((await headers()).get("accept-language") ?? "").toLowerCase();
  return al.includes("zh") ? "zh" : "en";
}
