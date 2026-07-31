/**
 * Behavioral tests for remove-legacy-agents — a one-off cleanup script
 * that drops the residual `server_agents` table.
 *
 * Mocks @/lib/db's raw SQL methods ($queryRawUnsafe / $executeRawUnsafe)
 * to exercise the dry-run and live branches, including the no-op path
 * when the table is already gone.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

async function loadScript() {
  const stamp = Date.now() + Math.random();
  return (await import(`./remove-legacy-agents?bust=${stamp}`)) as typeof import("./remove-legacy-agents");
}

describe("remove-legacy-agents", () => {
  test("dry-run with no table is a no-op that never executes DROP", async () => {
    let dropCalled = false;

    mock.module("@/lib/db", () => ({
      db: {
        $queryRawUnsafe: async () => [],
        $executeRawUnsafe: async () => {
          dropCalled = true;
          return 0;
        },
      },
    }));

    const script = await loadScript();
    await script.main([]);
    expect(dropCalled).toBe(false);
  });

  test("dry-run lists existing rows and does not drop", async () => {
    let dropCalled = false;

    mock.module("@/lib/db", () => ({
      db: {
        $queryRawUnsafe: async (sql: string) => {
          // First call: sqlite_master existence check → table exists.
          // Second call: row listing → one legacy agent.
          if (sql.includes("sqlite_master")) return [{ name: "server_agents" }];
          return [{ id: 1, hostname: "old-host", last_seen: "2026-07-01T00:00:00Z" }];
        },
        $executeRawUnsafe: async () => {
          dropCalled = true;
          return 0;
        },
      },
    }));

    const script = await loadScript();
    await script.main([]);
    expect(dropCalled).toBe(false);
  });

  test("--run drops the table when it exists", async () => {
    let droppedSql = "";

    mock.module("@/lib/db", () => ({
      db: {
        $queryRawUnsafe: async (sql: string) => {
          if (sql.includes("sqlite_master")) return [{ name: "server_agents" }];
          return [];
        },
        $executeRawUnsafe: async (sql: string) => {
          droppedSql = sql;
          return 0;
        },
      },
    }));

    const script = await loadScript();
    await script.main(["--run"]);
    expect(droppedSql).toContain("DROP TABLE IF EXISTS");
    expect(droppedSql).toContain("server_agents");
  });

  test("--run is a safe no-op when the table is already gone", async () => {
    let dropCalled = false;

    mock.module("@/lib/db", () => ({
      db: {
        $queryRawUnsafe: async () => [],
        $executeRawUnsafe: async () => {
          dropCalled = true;
          return 0;
        },
      },
    }));

    const script = await loadScript();
    await script.main(["--run"]);
    expect(dropCalled).toBe(false);
  });

  test("justfile recipe forwards arguments so `just remove-legacy-agents -- --run` works", async () => {
    // Indirect coverage for the Just forwarding contract: the recipe must
    // capture variadic args and pass them through to the script, and the
    // documented invocation must match.
    const justfile = await Bun.file("justfile").text();
    const recipe = justfile.match(/^remove-legacy-agents\s+\*ARGS:\n(\s+.*)$/m);
    expect(recipe).not.toBeNull();
    const body = recipe![1].trim();
    expect(body).toContain("remove-legacy-agents.ts");
    expect(body).toContain("{{ARGS}}");

    const agentsMd = await Bun.file("AGENTS.md").text();
    expect(agentsMd).toContain("just remove-legacy-agents -- --run");
  });
});
