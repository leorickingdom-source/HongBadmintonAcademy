import { redirect } from "next/navigation";
import { Feather } from "lucide-react";
import { getParentIdFromCookie } from "@/lib/parent-auth";
import { PinLoginForm } from "./pin-login-form";

export const dynamic = "force-dynamic";

// Edge-case re-auth: parent's cookie expired or was cleared. They enter phone +
// 4-digit PIN to get back in without bothering admin. Admin "Generate Login
// Link" is the recovery path if the PIN is also forgotten.
export default async function ParentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  // Already signed in → straight to the parent app.
  const existing = await getParentIdFromCookie();
  if (existing) redirect(next || "/parent");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-600 text-white shadow-xl">
        <Feather className="h-9 w-9" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome back, parent
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter your phone number and 4-digit PIN.
        </p>
      </div>

      <PinLoginForm error={error} next={next ?? null} />

      <div className="text-center text-xs text-slate-400">
        Forgot your PIN?{" "}
        <span className="text-slate-500">
          WhatsApp the academy and admin will send you a fresh login link.
        </span>
      </div>
    </main>
  );
}
