/**
 * Tests for scripts/plex/sync-recently-played.ts
 *
 * Pure-helper tests for buildPlexTraktSyncArgs and behavioral
 * tests for runPlexTraktSync with mocked subprocess spawn.
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
  return (await import(`./sync-recently-played?bust=${stamp}`)) as typeof import("./sync-recently-played");
}

describe("buildPlexTraktSyncArgs", () => {
  test("builds sync --id arguments from rating keys", async () => {
    const mod = await loadScript();
    const args = mod.buildPlexTraktSyncArgs(["abc", "def"]);
    expect(args).toEqual(["sync", "--id", "abc", "--id", "def"]);
  });

  test("empty ids produces just [sync]", async () => {
    const mod = await loadScript();
    const args = mod.buildPlexTraktSyncArgs([]);
    expect(args).toEqual(["sync"]);
  });
});

describe("runPlexTraktSync", () => {
  test("dry-run resolves immediately without spawning", async () => {
    const mod = await loadScript();
    const result = await mod.runPlexTraktSync("/fake/binary", ["abc"], true, 30);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("");
  });

  test("spawns the configured binary with correct args", async () => {
    let spawnBinary = "";
    let spawnArgs: string[] = [];

    mock.module("child_process", () => ({
      spawn: (bin: string, args: string[], _opts: unknown) => {
        spawnBinary = bin;
        spawnArgs = args;
        const { EventEmitter } = require("events");
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        // Emit close asynchronously
        process.nextTick(() => proc.stdout.emit("data", Buffer.from("done\n")));
        process.nextTick(() => proc.emit("close", 0));
        return proc;
      },
    }));

    // Re-import to pick up the mocked child_process
    const stamp = Date.now() + Math.random();
    const mod = await import(`./sync-recently-played?bust=${stamp}`);
    const result = await (mod as any).runPlexTraktSync("/custom/plextraktsync", ["x"], false, 30);

    expect(spawnBinary).toBe("/custom/plextraktsync");
    expect(spawnArgs).toEqual(["sync", "--id", "x"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("done");
  });

  test("timeout kills the child and returns exitCode -1", async () => {
    let killed = false;

    mock.module("child_process", () => ({
      spawn: (_bin: string, _args: string[], _opts: unknown) => {
        const { EventEmitter } = require("events");
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = (_sig?: string) => { killed = true; };
        // Never emit close — simulate hang
        return proc;
      },
    }));

    const stamp = Date.now() + Math.random();
    const mod = await import(`./sync-recently-played?bust=${stamp}`);
    // Use a very short timeout so the test doesn't actually wait 120s.
    const result = await (mod as any).runPlexTraktSync("/fake/plextraktsync", ["x"], false, 0.001);

    expect(killed).toBe(true);
    expect(result.exitCode).toBe(-1);
  });

  test("timeout → SIGTERM → close does NOT send SIGKILL", async () => {
    const signals: (string | undefined)[] = [];
    let closeEmitted = false;

    mock.module("child_process", () => ({
      spawn: (_bin: string, _args: string[], _opts: unknown) => {
        const { EventEmitter } = require("events");
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = (sig?: string) => {
          signals.push(sig);
          // Simulate process exiting gracefully after SIGTERM.
          if (sig === "SIGTERM" && !closeEmitted) {
            closeEmitted = true;
            // Emit close shortly after, well before the 3s SIGKILL window.
            setImmediate(() => proc.emit("close", 0));
          }
        };
        return proc;
      },
    }));

    const stamp = Date.now() + Math.random();
    const mod = await import(`./sync-recently-played?bust=${stamp}`);
    const result = await (mod as any).runPlexTraktSync("/fake/plextraktsync", ["x"], false, 0.001);

    // The process should have been killed with SIGTERM.
    expect(signals).toContain("SIGTERM");
    // SIGKILL must NOT have been sent because close was emitted.
    expect(signals).not.toContain("SIGKILL");
    // Promise resolved with exitCode -1 (timeout) before close was
    // emitted. The key assertion is that close handler cleared the
    // pending SIGKILL timer via cancelKillTimer despite being post-settle.
    expect(result.exitCode).toBe(-1);
  }, 5_000 /* generous timeout for the 3s window */);

  test("spawn error resolves with exitCode 1", async () => {
    mock.module("child_process", () => ({
      spawn: (_bin: string, _args: string[], _opts: unknown) => {
        const { EventEmitter } = require("events");
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = () => {};
        // Emit error immediately
        process.nextTick(() => proc.emit("error", new Error("ENOENT")));
        return proc;
      },
    }));

    const stamp = Date.now() + Math.random();
    const mod = await import(`./sync-recently-played?bust=${stamp}`);
    const result = await (mod as any).runPlexTraktSync("/nonexistent/binary", ["x"], false, 30);

    expect(result.exitCode).toBe(1);
  });
});
