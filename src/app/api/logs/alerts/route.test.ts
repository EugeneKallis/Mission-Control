/**
 * Unit tests for GET /api/logs/alerts
 *
 * Mocks child_process to return controlled journalctl output and
 * @/lib/db via makeTestDB so the watermark can be set/tested.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";
import type { PrismaClient } from "@prisma/client";
import { makeTestDB } from "@/lib/db/test-helpers";

interface ExecCall {
  cmd: string;
  args: string[];
}

let execCalls: ExecCall[] = [];
let testDB: { db: PrismaClient; cleanup: () => Promise<void> };

const DEFAULT_JOURNAL_OUTPUT = [
  "info: server started",
  "ERROR: database connection failed",
  "200 GET /api/health",
  "FATAL: cannot recover",
  "clean shutdown",
].join("\n");

beforeAll(async () => {
  testDB = await makeTestDB();

  mock.module("@/lib/db", () => ({ db: testDB.db }));

  mock.module("child_process", () => ({
    execFileSync: mock((cmd: string, args: string[]) => {
      execCalls.push({ cmd, args: [...args] });
      if (cmd === "journalctl") {
        const unitArg = args.find((a: string) => typeof a === "string" && a.startsWith("mission-control")) ?? "";

        // Return different content per service so we can verify per-service counts
        if (unitArg.includes("mission-control-scraper")) {
          return "scraper output\nError: scraper fail\n";
        }
        if (unitArg.includes("mission-control-broken-link-checker")) {
          return "checker running\n";
        }
        return DEFAULT_JOURNAL_OUTPUT;
      }
      return "";
    }),
  }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(() => {
  execCalls = [];
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("GET /api/logs/alerts", () => {
  test("returns 200 with correct JSON shape", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      perService: Record<string, number>;
      total: number;
      acknowledgedAt: number | null;
    };
    expect(typeof body.perService).toBe("object");
    expect(typeof body.total).toBe("number");
    expect(Object.keys(body.perService).sort()).toEqual([
      "agent-tasks",
      "broken-link-checker",
      "magnet-bridge",
      "scraper",
      "web",
    ]);
  });

  test("per-service breakdown matches mock journalctl output", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as {
      perService: Record<string, number>;
      total: number;
    };
    // scraper: "Error:" matches → 1
    expect(body.perService.scraper).toBe(1);
    // web (default output): "ERROR:" + "FATAL:" = 2
    expect(body.perService.web).toBe(2);
    // magnet-bridge also gets the default output → 2
    expect(body.perService["magnet-bridge"]).toBe(2);
    // broken-link-checker: no error lines → 0
    expect(body.perService["broken-link-checker"]).toBe(0);
    // total = sum of all four
    const expectedTotal =
      body.perService.web +
      body.perService["magnet-bridge"] +
      body.perService.scraper +
      body.perService["broken-link-checker"];
    expect(body.total).toBe(expectedTotal);
  });

  test("acknowledgedAt is null when no watermark has been set", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as { acknowledgedAt: number | null };
    expect(body.acknowledgedAt).toBeNull();
  });

  test("acknowledgedAt reflects the watermark after acknowledging", async () => {
    // Set watermark via the lib directly (no cache-bust — we need the
    // same module instance the route uses so the in-process cache is
    // invalidated properly).
    const { setAcknowledgedAt } = await import("@/lib/log-alerts-server");
    await setAcknowledgedAt(123456);

    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as { acknowledgedAt: number | null };
    expect(body.acknowledgedAt).toBe(123456);
  });

  test("passes --since to journalctl for each service", async () => {
    // Clear the in-process cache so getAllLogAlertCounts re-runs journalctl
    const { clearCountsCache } = await import("@/lib/log-alerts-server");
    clearCountsCache();

    const prevCalls = execCalls.length;
    const { GET } = await loadRoute();
    await GET();
    // Should have 4 new journalctl calls (plus any previous systemctl calls)
    const newJournalCalls = execCalls
      .slice(prevCalls)
      .filter((c) => c.cmd === "journalctl");
    expect(newJournalCalls.length).toBe(4);
    for (const call of newJournalCalls) {
      expect(call.args).toContain("--since");
    }
  });
});
