/**
 * Unit tests for src/workers/scraper-worker.ts.
 *
 * The worker is a thin shim around `runAllSources()` in scraper-runner.ts.
 * After the Phase S-3 refactor, `main()` is exported so we can call it
 * with a mocked `runAllSources` and assert it was invoked.
 *
 * Not covered (integration): the actual scraping HTTP fetches + DB writes.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the scraper-runner module BEFORE importing the worker so the
// worker's import resolves to our mock.
const runAllSourcesMock = mock(async () => {});
mock.module("./scraper-runner", () => ({
  runAllSources: runAllSourcesMock,
}));

const { main } = await import("./scraper-worker");

describe("scraper-worker", () => {
  beforeEach(() => {
    runAllSourcesMock.mockClear();
  });

  test("main is exported as a function", () => {
    expect(typeof main).toBe("function");
  });

  test("main calls runAllSources exactly once", async () => {
    await main();
    expect(runAllSourcesMock).toHaveBeenCalledTimes(1);
  });

  test("main propagates errors from runAllSources", async () => {
    runAllSourcesMock.mockImplementationOnce(async () => {
      throw new Error("scraper blew up");
    });
    await expect(main()).rejects.toThrow(/scraper blew up/);
    expect(runAllSourcesMock).toHaveBeenCalledTimes(1);
  });

  test("main awaits runAllSources before resolving", async () => {
    // If main didn't await, the test would race and we'd see
    // toHaveBeenCalledTimes(0). We assert it was called by the time
    // main() resolves.
    let calledWhileAwaiting = false;
    runAllSourcesMock.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 10));
      calledWhileAwaiting = true;
    });
    await main();
    expect(calledWhileAwaiting).toBe(true);
    expect(runAllSourcesMock).toHaveBeenCalledTimes(1);
  });
});
