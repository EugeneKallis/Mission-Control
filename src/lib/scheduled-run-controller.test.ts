import { describe, expect, test } from "bun:test";
import { ScheduledRunController, skippedRunOutput } from "./scheduled-run-controller";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("ScheduledRunController", () => {
  test("skip records the active history ID without starting a duplicate", async () => {
    const controller = new ScheduledRunController();
    const release = deferred();
    let starts = 0;
    const skipped: Array<{ id: number | undefined; reason: string }> = [];

    const active = controller.trigger("macro:1", "skip", {
      execute: async (setHistoryId) => {
        starts++;
        setHistoryId(42);
        await release.promise;
      },
      onSkip: async () => {},
    });

    await Promise.resolve();
    await controller.trigger("macro:1", "skip", {
      execute: async () => { starts++; },
      onSkip: async (id, reason) => { skipped.push({ id, reason }); },
    });

    expect(starts).toBe(1);
    expect(skipped).toEqual([{ id: 42, reason: "another run is active" }]);
    expect(skippedRunOutput(skipped[0].reason, skipped[0].id)).toContain("Active run ID: 42");
    release.resolve();
    await active;
  });

  test("queue-one runs one deferred trigger and skips further overlaps", async () => {
    const controller = new ScheduledRunController();
    const firstRelease = deferred();
    const secondRelease = deferred();
    const starts: number[] = [];
    const skipped: number[] = [];

    const first = controller.trigger("worker:x", "queue-one", {
      execute: async (setHistoryId) => {
        starts.push(1);
        setHistoryId(10);
        await firstRelease.promise;
      },
      onSkip: async () => {},
    });
    await Promise.resolve();

    await controller.trigger("worker:x", "queue-one", {
      execute: async (setHistoryId) => {
        starts.push(2);
        setHistoryId(11);
        await secondRelease.promise;
      },
      onSkip: async () => {},
    });
    await controller.trigger("worker:x", "queue-one", {
      execute: async () => { starts.push(3); },
      onSkip: async (id) => { if (id !== undefined) skipped.push(id); },
    });

    expect(starts).toEqual([1]);
    expect(skipped).toEqual([10]);
    firstRelease.resolve();
    await first;
    await Promise.resolve();
    expect(starts).toEqual([1, 2]);
    secondRelease.resolve();
  });

  test("allow starts overlapping runs", async () => {
    const controller = new ScheduledRunController();
    const release = deferred();
    let starts = 0;
    const trigger = () => controller.trigger("agent:1", "allow", {
      execute: async () => { starts++; await release.promise; },
      onSkip: async () => { throw new Error("should not skip"); },
    });

    const one = trigger();
    const two = trigger();
    await Promise.resolve();
    expect(starts).toBe(2);
    release.resolve();
    await Promise.all([one, two]);
  });
});
