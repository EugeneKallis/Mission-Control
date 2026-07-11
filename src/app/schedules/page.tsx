/**
 * /schedules — Schedule management page.
 *
 * Mirrors `SchedulesList` in schedules.templ:
 *  - "New Schedule" card with macro select + frequency form
 *  - List of existing schedules with toggle / edit / delete
 *  - Worker Timers section with preset workers and toggle (no delete)
 */

import { AppShell } from "@/components/layout/app-shell";
import { SchedulesList } from "@/components/schedules/schedules-list";
import { getMacros, listSchedules, listWorkerTimers } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  // Fetch macros, schedules, and worker timers in parallel on the server.
  const [macros, schedules, timers] = await Promise.all([
    getMacros(),
    listSchedules(),
    listWorkerTimers(),
  ]);

  return (
    <AppShell>
      <SchedulesList
        macros={macros.map((m) => ({
          id: m.id,
          name: m.name,
          groupName: m.groupName,
        }))}
        initialSchedules={schedules.map((s) => ({
          id: s.id,
          macroId: s.macroId,
          macroName: s.macro?.name ?? "(deleted macro)",
          cronExpression: s.cronExpression,
          enabled: s.enabled,
          createdAt: s.createdAt?.toISOString() ?? null,
        }))}
        initialTimers={timers.map((t) => ({
          id: t.id,
          name: t.name,
          workerPath: t.workerPath,
          cronExpression: t.cronExpression,
          enabled: t.enabled,
          lastRunAt: t.lastRunAt?.toISOString() ?? null,
          lastStatus: t.lastStatus,
          createdAt: t.createdAt?.toISOString() ?? null,
        }))}
      />
    </AppShell>
  );
}
