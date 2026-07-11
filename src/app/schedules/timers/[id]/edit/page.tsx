/**
 * /schedules/timers/[id]/edit — edit an existing worker timer.
 *
 * Uses the same form layout as the macro schedule edit, but for worker timers.
 */

import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EditTimerForm } from "@/components/schedules/edit-timer-form";
import { getWorkerTimer } from "@/lib/db/queries";
import { parseCronToForm } from "@/lib/cron";

export const dynamic = "force-dynamic";

export default async function EditTimerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isFinite(tid) || tid <= 0) {
    notFound();
  }

  let timer;
  try {
    timer = await getWorkerTimer(tid);
  } catch {
    notFound();
  }

  const formValues = parseCronToForm(timer.cronExpression);

  return (
    <AppShell>
      <EditTimerForm
        timerId={timer.id}
        timerName={timer.name}
        workerPath={timer.workerPath}
        initialEnabled={timer.enabled}
        initialValues={formValues}
      />
    </AppShell>
  );
}
