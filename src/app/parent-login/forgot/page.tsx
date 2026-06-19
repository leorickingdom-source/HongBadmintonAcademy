import { Feather } from "lucide-react";
import { requestPasswordReset } from "../actions";

export const dynamic = "force-dynamic";

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200";

export default async function ParentForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-600 text-white shadow-xl">
        <Feather className="h-9 w-9" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your email and we&apos;ll send you a reset link.</p>
      </div>

      {sent ? (
        <div className="w-full rounded-2xl border border-green-200 bg-green-50 p-6 text-center text-sm text-green-800">
          If that email is registered, a reset link is on its way. Check your inbox (and your spam folder).
        </div>
      ) : (
        <form action={requestPasswordReset} className="w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={INPUT} />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-green-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-green-700 active:scale-95"
          >
            Send reset link
          </button>
        </form>
      )}

      <a href="/parent-login" className="text-center text-xs font-medium text-slate-500 hover:text-slate-700">
        ← Back to sign in
      </a>
    </main>
  );
}
