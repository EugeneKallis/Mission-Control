/**
 * /schedules/[id]/edit — edit an existing schedule.
 *
 * Mirrors `EditSchedule` in schedules.templ: same form as the New Schedule
 * form, but pre-filled with the parsed cron expression.
 */

import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EditScheduleForm } from "@/components/schedules/edit-schedule-form";
import { getMacros, getSchedule } from "@/lib/db/queries";
import { parseCronToForm } from "@/lib/cron";

export const dynamic = "force-dynamic";

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sid = Number(id);
  if (!Number.isFinite(sid) || sid <= 0) {
    notFound();
  }

  let schedule;
  try {
    schedule = await getSchedule(sid);
  } catch {
    notFound();
  }

  const macros = await getMacros();
  const formValues = parseCronToForm(schedule.cronExpression);

  return (
    <AppShell>
      <EditScheduleForm
        scheduleId={schedule.id}
        initialEnabled={schedule.enabled}
        macros={macros.map((m) => ({
          id: m.id,
          name: m.name,
          groupName: m.groupName,
        }))}
        initialValues={formValues}
        initialMacroId={schedule.macroId}
      />
    </AppShell>
  );
}
