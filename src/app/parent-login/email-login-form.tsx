import { signInWithEmail } from "./actions";

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200";

// Plain server-action form (no client JS needed). Parents sign in with the
// email + password the academy set up for them.
export function EmailLoginForm({ error, next }: { error?: string; next: string | null }) {
  return (
    <form action={signInWithEmail} className="w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <input type="hidden" name="next" value={next ?? ""} />

      <div>
        <label className="block text-sm font-medium text-slate-700">Email</label>
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={INPUT} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Password</label>
        <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" className={INPUT} />
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-green-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-green-700 active:scale-95"
      >
        Sign in
      </button>
    </form>
  );
}
