/**
 * End-to-end test for the `just remove-legacy-agents` recipe, exercising
 * the real Just forwarding (`*ARGS` → script argv) against an isolated
 * temp SQLite DB via DATABASE_URL. No @/lib/db mocks — this spawns the
 * actual recipe + script as a subprocess.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { spawnSync } from "node:child_process";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const REPO_ROOT = process.cwd();
const tmpFiles: string[] = [];

async function makeLegacyDb(): Promise<string> {
  const filePath = join(tmpdir(), `mc-sa-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  tmpFiles.push(filePath);

  const raw = await readFile(
    join(REPO_ROOT, "prisma", "migrations", "20260621000306_init", "migration.sql"),
    "utf8",
  );
  const statements = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const db = createClient({ url: `file:${filePath}` });
  for (const stmt of statements) {
    await db.execute(stmt);
  }
  await db.execute(
    `INSERT INTO server_agents (hostname, ip_address, last_seen)
     VALUES ('old-host', '192.168.1.50', CURRENT_TIMESTAMP)`,
  );
  db.close();
  return filePath;
}

async function tableExists(filePath: string): Promise<boolean> {
  const db = createClient({ url: `file:${filePath}` });
  const res = await db.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'server_agents'`,
  );
  db.close();
  return (res.rows as unknown as { name: string }[]).length > 0;
}

function runJust(dbPath: string, args: string[]) {
  return spawnSync("just", args, {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    encoding: "utf8",
    timeout: 120_000,
  });
}

afterEach(async () => {
  for (const f of tmpFiles.splice(0)) {
    await unlink(f).catch(() => {});
  }
});

describe("just remove-legacy-agents (end-to-end)", () => {
  test("bare `just remove-legacy-agents` is a dry-run that lists rows and drops nothing", async () => {
    const dbPath = await makeLegacyDb();
    const res = runJust(dbPath, ["remove-legacy-agents"]);

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("DRY RUN");
    expect(res.stdout).toContain("old-host");
    expect(res.stdout).not.toContain("Dropped");
    expect(await tableExists(dbPath)).toBe(true);
  });

  test("`just remove-legacy-agents -- --run` forwards --run and drops the table", async () => {
    const dbPath = await makeLegacyDb();
    const res = runJust(dbPath, ["remove-legacy-agents", "--", "--run"]);

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Dropped legacy");
    expect(await tableExists(dbPath)).toBe(false);
  });

  test("re-running after the drop is a safe no-op", async () => {
    const dbPath = await makeLegacyDb();
    const first = runJust(dbPath, ["remove-legacy-agents", "--", "--run"]);
    expect(first.status).toBe(0);
    expect(await tableExists(dbPath)).toBe(false);

    const second = runJust(dbPath, ["remove-legacy-agents", "--", "--run"]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("already dropped");
  });
});
