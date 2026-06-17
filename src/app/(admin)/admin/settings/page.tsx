import { requireRole } from "@/lib/auth";
import { PageHeader, Section, Field, Input, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { isWorkerPaused, isFeeRemindersPaused, getMonthlySchedule } from "@/lib/settings";
import { WaLinkPanel } from "@/components/wa-link-panel";
import { toggleWorker, toggleFeeReminders, saveMonthlySchedule } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireRole("admin");
  const { error, saved } = await searchParams;
  const paused = await isWorkerPaused();
  const feePaused = await isFeeRemindersPaused();
  const schedule = await getMonthlySchedule();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="WhatsApp automation and the monthly run schedule." />

      {saved && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">Saved.</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <Section title="WhatsApp worker">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="text-sm text-slate-600">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium text-slate-800">Auto-send status:</span>
              <Badge tone={paused ? "red" : "green"}>{paused ? "Paused" : "Running"}</Badge>
            </div>
            {paused
              ? "Reminders & growth reports are NOT being sent. They stay queued and go out once resumed."
              : "Queued reminders & growth reports drip-send automatically (throttled)."}
          </div>
          <form action={toggleWorker}>
            <input type="hidden" name="paused" value={paused ? "false" : "true"} />
            <SubmitButton variant={paused ? "primary" : "secondary"} pendingText="Saving…">
              {paused ? "Resume worker" : "Pause worker"}
            </SubmitButton>
          </form>
        </div>
      </Section>

      <Section title="Link WhatsApp (scan QR)" description="Re-link the dedicated number after a logout — scan from here, no SSH needed." flush>
        <WaLinkPanel />
      </Section>

      <Section title="Auto fee reminders">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="text-sm text-slate-600">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium text-slate-800">Status:</span>
              <Badge tone={feePaused ? "amber" : "green"}>{feePaused ? "Parked" : "On"}</Badge>
            </div>
            {feePaused
              ? "No fee reminders are queued or sent. Growth reports & announcements still go out."
              : "Due/overdue fee reminders auto-queue daily and drip-send to parents."}
          </div>
          <form action={toggleFeeReminders}>
            <input type="hidden" name="paused" value={feePaused ? "false" : "true"} />
            <SubmitButton variant={feePaused ? "primary" : "secondary"} pendingText="Saving…">
              {feePaused ? "Resume reminders" : "Park reminders"}
            </SubmitButton>
          </form>
        </div>
      </Section>

      <Section title="Monthly schedule">
        <form action={saveMonthlySchedule} className="space-y-4 p-5">
          <p className="text-sm text-slate-600">
            The <strong>run day</strong> is when invoices and growth reports are generated each month (they go out as
            one combined Community post). The <strong>due day</strong> is when each fee falls due. Days 1–28; the crons
            check daily. The manual &quot;Generate this month&quot; buttons work any day.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly run day" hint="Raise fees + build reports + post the notice.">
              <Input type="number" name="runDay" min={1} max={28} defaultValue={schedule.runDay} />
            </Field>
            <Field label="Invoice due day">
              <Input type="number" name="dueDay" min={1} max={28} defaultValue={schedule.dueDay} />
            </Field>
          </div>
          <SubmitButton pendingText="Saving…">Save schedule</SubmitButton>
        </form>
      </Section>
    </div>
  );
}
