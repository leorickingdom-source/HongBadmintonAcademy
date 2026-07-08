import { listBranches } from "@/lib/branch";
import { SubmitButton } from "@/components/submit-button";
import { dict } from "@/lib/i18n";
import { getPublicLocale } from "@/lib/public-locale";
import { PublicLangToggle } from "@/components/public-lang-toggle";
import { requestTrial } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "h-10 w-full rounded-lg border border-slate-300 px-3 text-base sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export default async function TrialPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const locale = await getPublicLocale();
  const L = dict(locale);
  // Public page — branch names aren't sensitive; list active branches for the
  // optional "preferred branch" picker.
  const branches = await listBranches();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-5 py-10">
      <div className="flex justify-end">
        <PublicLangToggle locale={locale} />
      </div>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white">HBA</div>
        <h1 className="text-2xl font-bold text-slate-900">{L.trp_title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {L.trp_desc}
        </p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form action={requestTrial} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Company<input type="text" name="company" tabIndex={-1} autoComplete="off" /></label>
        </div>

        {/* ── Child ── */}
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{L.trp_child_name}</span>
            <input name="child_name" required className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{L.sf_dob} <span className="font-normal text-slate-400">{L.trp_optional}</span></span>
              <input type="date" name="child_dob" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{L.trp_experience}</span>
              <select name="experience" defaultValue="" className={inputCls}>
                <option value="">{L.trp_exp_unsure}</option>
                <option value="none">{L.exp_none}</option>
                <option value="some">{L.exp_some}</option>
                <option value="experienced">{L.exp_experienced}</option>
              </select>
            </label>
          </div>
        </div>

        {/* ── Parent / contact ── */}
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{L.trp_your_name}</span>
            <input name="parent_name" required className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{L.trp_phone}</span>
            <input name="phone" inputMode="tel" required className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{L.email_label} <span className="font-normal text-slate-400">{L.trp_optional}</span></span>
            <input type="email" name="email" className={inputCls} />
          </label>
        </div>

        {/* ── Preferences ── */}
        <div className="space-y-3">
          {branches.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{L.trp_pref_location} <span className="font-normal text-slate-400">{L.trp_optional}</span></span>
              <select name="branch_id" defaultValue="" className={inputCls}>
                <option value="">{L.trp_no_pref}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{L.trp_pref_times} <span className="font-normal text-slate-400">{L.trp_optional}</span></span>
            <input name="preferred_slot" placeholder={L.trp_times_ph} className={inputCls} />
          </label>
        </div>

        {/* ── Consent (required) ── */}
        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <input type="checkbox" name="consent" value="on" required className="mt-0.5" />
          <span className="text-xs text-slate-600">{L.trp_consent}</span>
        </label>

        <SubmitButton pendingText={L.trp_sending}>{L.trp_submit}</SubmitButton>
        <p className="text-center text-xs text-slate-400">{L.trp_footer}</p>
      </form>
    </main>
  );
}
