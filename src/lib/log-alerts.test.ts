/**
 * Unit tests for log-alerts helpers.
 *
 * Pure functions (isErrorLine, countErrorsInText) need no mocking.
 * DB helpers (getAcknowledgedAt / setAcknowledgedAt) use makeTestDB()
 * with mock.module("@/lib/db").
 * Aggregation (getAllLogAlertCounts) additionally mocks child_process
 * so journalctl returns controlled test content.
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
import type { PrismaClient } from "@prisma/client";
import { makeTestDB } from "@/lib/db/test-helpers";

// ── Pure function tests (no mocking) ────────────────────────────────────

describe("isErrorLine", () => {
  test("matches ERROR", () => {
    const { isErrorLine } = require("./log-alerts");
    expect(isErrorLine("ERROR: something broke")).toBe(true);
    expect(isErrorLine("[ERROR] crashed")).toBe(true);
  });

  test("matches error (lowercase)", () => {
    const { isErrorLine } = require("./log-alerts");
    expect(isErrorLine("something broke: error in module x")).toBe(true);
  });

  test("matches fatal", () => {
    const { isErrorLine } = require("./log-alerts");
    expect(isErrorLine("FATAL: kernel panic")).toBe(true);
    expect(isErrorLine("fatal error occurred")).toBe(true);
  });

  test("matches panic / crashed / exception / failed", () => {
    const { isErrorLine } = require("./log-alerts");
    expect(isErrorLine("panic: runtime error")).toBe(true);
    expect(isErrorLine("system crash")).toBe(true);
    expect(isErrorLine("Error: uncaught exception")).toBe(true);
    expect(isErrorLine("Failed to connect")).toBe(true);
  });

  test("ignores GET / POST request lines even if they contain error", () => {
    const { isErrorLine } = require("./log-alerts");
    expect(isErrorLine('GET /api/error-handler 500')).toBe(false);
    expect(isErrorLine('POST /api/errors 404')).toBe(false);
    expect(isErrorLine('"GET /api/failed-request 200')).toBe(false);
    expect(isErrorLine('GET /api/logs 200')).toBe(false);
  });

  test("returns false for benign log lines", () => {
    const { isErrorLine } = require("./log-alerts");
    expect(isErrorLine("info: server started on port 3000")).toBe(false);
    expect(isErrorLine("200 GET /api/health")).toBe(false);
    expect(isErrorLine("everything is fine")).toBe(false);
    expect(isErrorLine("")).toBe(false);
  });
});

describe("countErrorsInText", () => {
  test("counts error lines in multiline text", () => {
    const { countErrorsInText } = require("./log-alerts");
    const text = [
      "[INFO] server started",
      "ERROR: database connection failed",
      "200 GET /api/health",
      "FATAL: cannot recover",
      "clean shutdown",
    ].join("\n");
    expect(countErrorsInText(text)).toBe(2);
  });

  test("returns 0 for empty or non-error text", () => {
    const { countErrorsInText } = require("./log-alerts");
    expect(countErrorsInText("")).toBe(0);
    expect(countErrorsInText("all good\nstill good")).toBe(0);
  });

  test("excludes request lines from error count", () => {
    const { countErrorsInText } = require("./log-alerts");
    const text = [
      "GET /api/error/log 500", // request line → excluded
      "Error: actual backend failure", // counts
      'POST /api/something 200', // request line → excluded
    ].join("\n");
    expect(countErrorsInText(text)).toBe(1);
  });
});

// ── DB watermark tests ──────────────────────────────────────────────────

describe("DB watermark (getAcknowledgedAt / setAcknowledgedAt)", () => {
  let testDB: { db: PrismaClient; cleanup: () => Promise<void> };

  beforeAll(async () => {
    testDB = await makeTestDB();
    mock.module("@/lib/db", () => ({ db: testDB.db }));
    mock.module("child_process", () => ({
      execFileSync: mock(() => ""),
    }));
  });

  afterAll(async () => {
    await testDB.cleanup();
  });

  test("returns null when no watermark exists", async () => {
    const { getAcknowledgedAt } = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    const result = await getAcknowledgedAt();
    expect(result).toBeNull();
  });

  test("returns the stored epoch ms", async () => {
    const { setAcknowledgedAt, getAcknowledgedAt } = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    const now = Date.now();
    await setAcknowledgedAt(now);
    const result = await getAcknowledgedAt();
    expect(result).toBe(now);
  });

  test("overwrites a previous watermark", async () => {
    const { setAcknowledgedAt, getAcknowledgedAt } = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    await setAcknowledgedAt(1000);
    await setAcknowledgedAt(2000);
    const result = await getAcknowledgedAt();
    expect(result).toBe(2000);
  });

  test("setAcknowledgedAt clears the in-memory cache", async () => {
    const mod = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    // Prime cache by calling getAllLogAlertCounts
    await mod.getAllLogAlertCounts();

    // Set acknowledgedAt — this clears the in-memory cache
    await mod.setAcknowledgedAt(9999);

    // Fresh call on the same module instance — should miss cache, read DB
    const result = await mod.getAllLogAlertCounts();
    expect(result.acknowledgedAt).toBe(9999);
  });
});

// ── Aggregation tests (mock journalctl + mock DB) ───────────────────────

describe("getAllLogAlertCounts", () => {
  let testDB: { db: PrismaClient; cleanup: () => Promise<void> };

  beforeAll(async () => {
    testDB = await makeTestDB();
    mock.module("@/lib/db", () => ({ db: testDB.db }));
    mock.module("child_process", () => ({
      execFileSync: mock((cmd: string, args: string[]) => {
        if (cmd === "journalctl") {
          const unitArg = args.find((a: string) => a.startsWith("mission-control")) ?? "";
          if (unitArg.includes("mission-control-scraper")) {
            return "scraper started\nError: scraper failure\nFATAL: crashed";
          }
          if (unitArg.includes("mission-control-broken-link-checker")) {
            return "checker running\nnormal line\n";
          }
          return "info: running\n";
        }
        return "";
      }),
    }));
  });

  afterAll(async () => {
    await testDB.cleanup();
  });

  test("aggregates counts from mocked journalctl output", async () => {
    // Re-mock for this test to return clean output
    // Since mock.module is process-global, we just use the existing
    // mock and test behavior. The mock above has error for scraper.
    const { getAllLogAlertCounts } = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    const result = await getAllLogAlertCounts();
    expect(typeof result.total).toBe("number");
    expect(typeof result.perService).toBe("object");
    // The mock has one error for scraper
    expect(result.perService.scraper).toBeGreaterThanOrEqual(1);
  });

  test("per-service breakdown matches mock output", async () => {
    const { getAllLogAlertCounts } = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    const result = await getAllLogAlertCounts();
    // scraper: 2 errors ("Error:" + "FATAL:")
    expect(result.perService.scraper).toBe(2);
    // broken-link-checker: 0 errors
    expect(result.perService["broken-link-checker"]).toBe(0);
  });

  test("acknowledgedAt is null when no watermark set", async () => {
    const { getAllLogAlertCounts } = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    const result = await getAllLogAlertCounts();
    expect(result.acknowledgedAt).toBeNull();
  });

  test("acknowledgedAt reflects the stored watermark", async () => {
    const setMod = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    await setMod.setAcknowledgedAt(5000);

    const { getAllLogAlertCounts } = await import(
      `./log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    const result = await getAllLogAlertCounts();
    expect(result.acknowledgedAt).toBe(5000);
  });
});
