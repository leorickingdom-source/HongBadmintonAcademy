import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED = ["/admin", "/coach", "/parent"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  // Gate protected areas: send anonymous users to login.
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Authenticated user on /login → bounce to the role router at "/".
  if (path === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and the NFC/webhook/cron APIs
  // (those authenticate themselves via secrets, not cookies).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/nfc|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
