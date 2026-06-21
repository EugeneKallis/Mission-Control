/**
 * /schedules — Schedule management page.
 *
 * Mirrors `SchedulesList` in schedules.templ:
 *  - "New Schedule" card with macro select + frequency form
 *  - List of existing schedules with toggle / edit / delete
 */

import { AppShell } from "@/components/layout/app-shell";
import { SchedulesList } from "@/components/schedules/schedules-list";
import { getMacros, listSchedules } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  // Fetch macros and schedules in parallel on the server.
  const [macros, schedules] = await Promise.all([getMacros(), listSchedules()]);

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
      />
    </AppShell>
  );
}
