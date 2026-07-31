#!/usr/bin/env bun
/**
 * remove-legacy-agents — remove residual legacy ServerAgent DB state.
 *
 * The legacy remote-agent / Server Status system (server_agents table,
 * /api/agent/* routes, lib/agents registry) has been removed from the
 * codebase and replaced by the Proxmox dashboard (/pve) and the Pi
 * agent system (/chat, /agent-tasks). This script is an operator
 * convenience for clearing any leftover `server_agents` rows that were
 * written before the removal migration ran.
 *
 * The Prisma migration `20260731120000_remove_server_agents` drops the
 * table, so against a migrated DB this script is a safe no-op. It only
 * ever touches the `server_agents` table — it never touches Pi
 * sessions, Pi tasks, macros, or any other data.
 *
 * Usage:
 *   just remove-legacy-agents                      # dry-run (default)
 *   just remove-legacy-agents -- --run             # actually drop the table
 *
 * Dry-run is the default (safe preview). Pass --run to mutate.
 */

import { db } from "@/lib/db";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary } from "../_lib/log";

export async function main(argv?: string[]) {
  const args = parseArgs({ run: { type: "boolean", default: false } }, argv);
  const dryRun = !args.run;
  banner("remove-legacy-agents", { dryRun });

  // Does the legacy table still exist? After the removal migration runs
  // this is already gone and the script is a pure no-op.
  const tableRows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'server_agents'`,
  );
  const exists = tableRows.length > 0;

  if (!exists) {
    info("No legacy `server_agents` table found — nothing to remove.");
    summary({
      "Table:": "already dropped (no-op)",
      "Mode:": dryRun ? "DRY RUN" : "LIVE",
    });
    return;
  }

  if (dryRun) {
    const rows = await db.$queryRawUnsafe<
      { id: number; hostname: string; last_seen: Date | string | null }[]
    >(`SELECT id, hostname, last_seen FROM server_agents ORDER BY hostname`);
    info(`Found legacy server_agents table with ${rows.length} row(s):`);
    for (const r of rows) {
      info(`  #${r.id} ${r.hostname} (last seen ${r.last_seen ?? "never"})`);
    }
    info("Dry run — pass --run to drop the table.");
    summary({
      "Rows:": String(rows.length),
      "Mode:": "DRY RUN",
    });
    return;
  }

  // Live: drop the legacy table. `DROP TABLE IF EXISTS` keeps the script
  // idempotent — re-running it after the table is gone is a no-op.
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "server_agents"`);
  info("Dropped legacy `server_agents` table.");
  summary({
    "Table:": "dropped",
    "Mode:": "LIVE",
  });
}

if (import.meta.main) {
  main()
    .catch((err) => {
      error("remove-legacy-agents failed", err);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
