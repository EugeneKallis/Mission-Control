/**
 * Regression test for prisma/migrations/20260731120000_remove_server_agents.
 *
 * Verifies two safety properties of the removal migration:
 *
 *   1. Schedules whose macro was flagged `run_on_agent = 1` are disabled
 *      BEFORE the flag is dropped, so a legacy "remote" schedule can never
 *      silently start executing against the local runner (the in-process
 *      cron scheduler only loads enabled schedules).
 *   2. The migration is idempotent with the operator cleanup script
 *      (scripts/util/remove-legacy-agents.ts): `DROP TABLE IF EXISTS`
 *      still applies cleanly if the script already dropped `server_agents`.
 *
 * Uses a fresh temp SQLite DB per test with ONLY the init migration applied
 * (pre-removal schema), then applies the removal migration's statements.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const MIGRATIONS_ROOT = join(process.cwd(), "prisma", "migrations");

let db: ReturnType<typeof createClient>;
let filePath: string;

/** Read a migration file, strip `--` line comments, split on `;`. */
async function migrationStatements(dir: string): Promise<string[]> {
  const raw = await readFile(join(MIGRATIONS_ROOT, dir, "migration.sql"), "utf8");
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function apply(statements: string[]): Promise<void> {
  for (const stmt of statements) {
    await db.execute(stmt);
  }
}

type Row = Record<string, unknown>;

async function query(sql: string): Promise<Row[]> {
  const res = await db.execute(sql);
  return res.rows as unknown as Row[];
}

beforeEach(async () => {
  filePath = join(tmpdir(), `mc-sa-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = createClient({ url: `file:${filePath}` });
  await apply(await migrationStatements("20260621000306_init"));
});

afterEach(async () => {
  db.close();
  await unlink(filePath).catch(() => {});
});

describe("20260731120000_remove_server_agents", () => {
  test("disables schedules whose macro had run_on_agent=true before dropping the flag", async () => {
    // macro 1: run_on_agent=1 + enabled schedule → must be disabled
    // macro 2: run_on_agent=0 + enabled schedule → must stay enabled
    // macro 3: run_on_agent=1 + already-disabled schedule → stays disabled
    await apply([
      `INSERT INTO macros (name, description, group_name, ord, run_on_agent, agent_hostname, commands) VALUES
         ('remote', '', 'Ungrouped', 0, 1, 'host-a', '[]'),
         ('local',  '', 'Ungrouped', 1, 0, '', '[]'),
         ('remote-off', '', 'Ungrouped', 2, 1, 'host-b', '[]')`,
      `INSERT INTO schedules (macro_id, cron_expression, enabled, created_at) VALUES
         (1, '0 * * * *', 1, CURRENT_TIMESTAMP),
         (2, '0 * * * *', 1, CURRENT_TIMESTAMP),
         (3, '0 * * * *', 0, CURRENT_TIMESTAMP)`,
    ]);

    await apply(await migrationStatements("20260731120000_remove_server_agents"));

    const rows = await query(`SELECT macro_id, enabled FROM schedules ORDER BY macro_id`);
    expect(rows).toHaveLength(3);
    // schedule 1 (run_on_agent macro) must be disabled
    expect(rows[0]).toMatchObject({ macro_id: 1, enabled: 0 });
    // schedule 2 (local macro) untouched
    expect(rows[1]).toMatchObject({ macro_id: 2, enabled: 1 });
    // schedule 3 was already disabled
    expect(rows[2]).toMatchObject({ macro_id: 3, enabled: 0 });
  });

  test("drops server_agents and the run_on_agent / agent_hostname columns", async () => {
    await apply([`INSERT INTO macros (name, description, group_name, ord, run_on_agent, agent_hostname, commands)
                  VALUES ('m', '', 'Ungrouped', 0, 0, '', '[]')`]);

    await apply(await migrationStatements("20260731120000_remove_server_agents"));

    const tables = await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'server_agents'`);
    expect(tables).toHaveLength(0);

    const macroCols = await query(`PRAGMA table_info(macros)`);
    const names = macroCols.map((c) => c.name);
    expect(names).not.toContain("run_on_agent");
    expect(names).not.toContain("agent_hostname");
    // sanity: remaining macros intact
    const macros = await query(`SELECT id, name FROM macros`);
    expect(macros).toHaveLength(1);
  });

  test("is idempotent when the cleanup script already dropped server_agents", async () => {
    // Simulate `just remove-legacy-agents -- --run` on the un-migrated DB.
    await db.execute(`DROP TABLE IF EXISTS "server_agents"`);

    // The migration must still apply without "no such table" errors.
    await expect(apply(await migrationStatements("20260731120000_remove_server_agents"))).resolves.toBeUndefined();

    const tables = await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'server_agents'`);
    expect(tables).toHaveLength(0);
  });
});
