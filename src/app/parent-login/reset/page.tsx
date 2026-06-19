import { Feather } from "lucide-react";
import { setNewPassword } from "../actions";

export const dynamic = "force-dynamic";

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200";

export default async function ParentResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-600 text-white shadow-xl">
        <Feather className="h-9 w-9" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">Pick a password at least 8 characters long.</p>
      </div>

      <form action={setNewPassword} className="w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        <input type="hidden" name="code" value={code ?? ""} />
        <div>
          <label className="block text-sm font-medium text-slate-700">New password</label>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" className={INPUT} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Confirm password</label>
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" className={INPUT} />
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-green-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-green-700 active:scale-95"
        >
          Set password &amp; sign in
        </button>
      </form>

      <a href="/parent-login" className="text-center text-xs font-medium text-slate-500 hover:text-slate-700">
        ← Back to sign in
      </a>
    </main>
  );
}
