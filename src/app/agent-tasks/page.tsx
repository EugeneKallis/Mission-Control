/**
 * /agent-tasks — Scheduled Agent Tasks page.
 *
 * Lists all scheduled tasks with controls for create / edit / toggle / delete / run-now.
 * Each task has its own tool/skill allowlist and a prompt that runs headlessly via pi.
 */

import { AppShell } from "@/components/layout/app-shell";
import { AgentTasksPage } from "@/components/agent-tasks/agent-tasks-page";
import { listAgentTasks } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AgentTasks() {
  const tasks = await listAgentTasks();

  return (
    <AppShell>
      <AgentTasksPage
        initialTasks={tasks.map((t) => ({
          id: t.id,
          name: t.name,
          prompt: t.prompt,
          cronExpression: t.cronExpression,
          enabled: t.enabled,
          provider: t.provider,
          model: t.model,
          thinkingLevel: t.thinkingLevel,
          enabledTools: t.enabledTools,
          disabledTools: t.disabledTools,
          enabledSkills: t.enabledSkills,
          noSkills: t.noSkills,
          appendSystem: t.appendSystem,
          persistSession: t.persistSession,
          timeoutSec: t.timeoutSec,
          lastRunAt: t.lastRunAt?.toISOString() ?? null,
          lastStatus: t.lastStatus,
          createdAt: t.createdAt?.toISOString() ?? null,
        }))}
      />
    </AppShell>
  );
}
