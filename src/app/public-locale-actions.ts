"use server";

import { cookies } from "next/headers";
import { PUBLIC_LANG_COOKIE } from "@/lib/public-locale";

// Toggle the public (pre-auth) UI language. Sets a 1-year cookie; the form
// submission re-renders the page, which re-reads the cookie via getPublicLocale.
export async function setPublicLocale(formData: FormData) {
  const v = String(formData.get("locale") ?? "") === "zh" ? "zh" : "en";
  (await cookies()).set(PUBLIC_LANG_COOKIE, v, {
    maxAge: 31536000,
    path: "/",
    sameSite: "lax",
  });
}
