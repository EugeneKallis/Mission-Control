/**
 * Unit tests for POST /api/scraper/trigger-all
 *
 * The handler just calls @/workers/scraper-runner.triggerAllSourcesInBackground
 * and returns success. We mock the runner so it never actually starts.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  beforeEach,
} from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

// `mock.module` is hoisted to the top of the file by bun.

let triggerAllMock: ReturnType<typeof mock> = mock(() => {});

const runnerState = {
  triggerAllSourcesInBackground: (..._args: unknown[]) =>
    triggerAllMock(..._args),
  triggerSourceInBackground: (..._args: unknown[]) =>
    triggerAllMock(..._args),
};

mock.module("@/workers/scraper-runner", () => runnerState);

beforeAll(() => {
  // mocks registered at module load
});

beforeEach(() => {
  triggerAllMock = mock(() => {});
  runnerState.triggerAllSourcesInBackground = (..._args: unknown[]) =>
    triggerAllMock(..._args);
  runnerState.triggerSourceInBackground = (..._args: unknown[]) =>
    triggerAllMock(..._args);
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── POST /api/scraper/trigger-all ────────────────────────────────────────

describe("POST /api/scraper/trigger-all", () => {
  test("returns 200 with success: true", async () => {
    const { POST } = await loadRoute();
    const res = await POST();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  test("invokes triggerAllSourcesInBackground exactly once", async () => {
    const { POST } = await loadRoute();
    await POST();
    expect(triggerAllMock).toHaveBeenCalledTimes(1);
  });

  test("does not pass any arguments to the runner", async () => {
    const { POST } = await loadRoute();
    await POST();
    expect(triggerAllMock.mock.calls[0]).toEqual([]);
  });
});
