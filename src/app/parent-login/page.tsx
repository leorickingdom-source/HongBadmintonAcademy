import { redirect } from "next/navigation";
import { Feather } from "lucide-react";
import { getParentIdFromCookie } from "@/lib/parent-auth";
import { EmailLoginForm } from "./email-login-form";

export const dynamic = "force-dynamic";

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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back, parent</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with your email and password.</p>
      </div>

      <EmailLoginForm error={error} next={next ?? null} />

      <a href="/parent-login/forgot" className="text-center text-xs font-medium text-slate-500 hover:text-slate-700">
        Forgot your password?
      </a>

      <a href="/login" className="text-center text-xs font-medium text-slate-500 hover:text-slate-700">
        Coach or admin? Staff login →
      </a>
    </main>
  );
}
