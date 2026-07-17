/**
 * Tests for src/lib/pi/process-manager.ts (singleton architecture)
 *
 * Covers:
 *  - Singleton process lifecycle (spawn, send, subscribe)
 *  - Process manager (getOrCreate, get, destroy)
 */

import { describe, test, expect, afterEach } from "bun:test";
import { piProcessManager } from "./process-manager";

describe("PiProcessManager (singleton)", () => {
  afterEach(() => {
    piProcessManager.destroy();
  });

  test("getOrCreate returns a process", async () => {
    const process = await piProcessManager.getOrCreate();
    expect(process).toBeDefined();
    expect(process.cwd).toBeTruthy();
    expect(process.exited).toBe(false);
  });

  test("get returns undefined before first getOrCreate", () => {
    expect(piProcessManager.get()).toBeUndefined();
  });

  test("get returns process after getOrCreate", async () => {
    const p1 = await piProcessManager.getOrCreate();
    const p2 = piProcessManager.get();
    expect(p2).toBe(p1);
  });

  test("getOrCreate is idempotent", async () => {
    const p1 = await piProcessManager.getOrCreate();
    const p2 = await piProcessManager.getOrCreate();
    expect(p1).toBe(p2);
  });

  test("destroy kills the process", async () => {
    const process = await piProcessManager.getOrCreate();
    piProcessManager.destroy();
    expect(piProcessManager.get()).toBeUndefined();
  });

  test("process subscribes to events", async () => {
    const process = await piProcessManager.getOrCreate();
    const events: unknown[] = [];
    const unsub = process.subscribe((e) => events.push(e));
    expect(typeof unsub).toBe("function");
    unsub();
  });

  test("process.send sends an RPC command", async () => {
    const process = await piProcessManager.getOrCreate();
    expect(() => process.send({ type: "get_state" })).not.toThrow();
  });

  test("spawn is idempotent", async () => {
    const process = await piProcessManager.getOrCreate();
    // Calling getOrCreate again should not re-spawn
    const process2 = await piProcessManager.getOrCreate();
    expect(process).toBe(process2);
  });
});
