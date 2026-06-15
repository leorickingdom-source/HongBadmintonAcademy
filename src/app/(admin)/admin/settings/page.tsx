import { requireRole } from "@/lib/auth";
import { PageHeader, Card, Section, Field, Input, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABEL } from "@/lib/constants";
import { isWorkerPaused, isFeeRemindersPaused, getMonthlySchedule } from "@/lib/settings";
import { updateOwnProfile, toggleWorker, toggleFeeReminders, saveMonthlySchedule } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const profile = await requireRole("admin");
  const { error, saved } = await searchParams;
  const paused = await isWorkerPaused();
  const feePaused = await isFeeRemindersPaused();
  const schedule = await getMonthlySchedule();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Account details and WhatsApp automation controls." />

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
            Which day of the month invoices &amp; growth reports go out (1–28). The crons check daily and
            act only on these days. The manual &quot;Generate this month&quot; buttons work any day.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Invoice day" hint="Raise fees + post the Community notice.">
              <Input type="number" name="invoiceDay" min={1} max={28} defaultValue={schedule.invoiceDay} />
            </Field>
            <Field label="Invoice due day">
              <Input type="number" name="dueDay" min={1} max={28} defaultValue={schedule.dueDay} />
            </Field>
            <Field label="Growth report day">
              <Input type="number" name="reportDay" min={1} max={28} defaultValue={schedule.reportDay} />
            </Field>
          </div>
          <SubmitButton pendingText="Saving…">Save dates</SubmitButton>
        </form>
      </Section>

      <Card className="max-w-xl p-6">
        {saved && <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">Saved.</p>}
        {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <form action={updateOwnProfile} className="space-y-4">
          <Field label="Full name" required>
            <Input name="full_name" defaultValue={profile.full_name ?? ""} required />
          </Field>

          <Field label="Email" hint="Email can't be changed here.">
            <Input
              defaultValue={profile.email ?? ""}
              readOnly
              className="bg-slate-50 text-slate-500"
            />
          </Field>

          <Field label="Role">
            <Input defaultValue={ROLE_LABEL[profile.role] ?? profile.role} readOnly className="bg-slate-50 text-slate-500" />
          </Field>

          <Field label="Phone (WhatsApp)" hint="E.164 format, e.g. +60123456789">
            <Input name="phone" defaultValue={profile.phone ?? ""} placeholder="+60…" />
          </Field>

          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
