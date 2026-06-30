/**
 * Unit tests for POST /api/scraper/trigger
 *
 * Validates body, checks the is_scraping soft guard, and forks the
 * background runner. We mock both @/workers/scrapers/status and
 * @/workers/scraper-runner so the route never actually starts a scrape.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  beforeEach,
} from "bun:test";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

// `mock.module` is hoisted to the top of the file by bun. We register
// the mocks here with factories that read from mutable module-level
// objects so each test can swap the underlying mock function.

let getScrapingStatusMock: ReturnType<typeof mock> = mock(async () => false);
let triggerSourceInBackgroundMock: ReturnType<typeof mock> = mock(() => {});

const statusState = {
  getScrapingStatus: (..._args: unknown[]) => getScrapingStatusMock(..._args),
};
const runnerState = {
  triggerSourceInBackground: (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args),
  triggerAllSourcesInBackground: (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args),
};

mock.module("@/workers/scrapers/status", () => statusState);
mock.module("@/workers/scraper-runner", () => runnerState);

beforeAll(() => {
  // nothing to do — mocks are registered at module load
});

beforeEach(() => {
  getScrapingStatusMock = mock(async (_source: string) => false);
  triggerSourceInBackgroundMock = mock(() => {});
  statusState.getScrapingStatus = (..._args: unknown[]) =>
    getScrapingStatusMock(..._args);
  runnerState.triggerSourceInBackground = (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args);
  runnerState.triggerAllSourcesInBackground = (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args);
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── POST /api/scraper/trigger ────────────────────────────────────────────

describe("POST /api/scraper/trigger", () => {
  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/scraper/trigger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on missing source field", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/trigger", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 on invalid source value", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/trigger", {
      source: "unknown-source",
    }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("triggers the runner and returns success on the happy path", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/trigger", {
      source: "141jav",
    }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { success: boolean; source: string };
    expect(body).toEqual({ success: true, source: "141jav" });
    expect(triggerSourceInBackgroundMock).toHaveBeenCalledTimes(1);
    expect(triggerSourceInBackgroundMock.mock.calls[0][0]).toBe("141jav");
  });

  test("returns already_running=true and skips the runner when status is true", async () => {
    getScrapingStatusMock = mock(async (_source: string) => true);
    statusState.getScrapingStatus = (..._args: unknown[]) =>
      getScrapingStatusMock(..._args);
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/trigger", {
      source: "projectjav",
    }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      success: boolean;
      already_running: boolean;
      source: string;
    };
    expect(body).toEqual({
      success: true,
      already_running: true,
      source: "projectjav",
    });
    expect(triggerSourceInBackgroundMock).not.toHaveBeenCalled();
  });

  test("accepts every valid source enum value", async () => {
    for (const source of ["141jav", "projectjav", "pornrips"]) {
      const { POST } = await loadRoute();
      const res = await POST(jsonRequest("/api/scraper/trigger", { source }));
      expect(status(res)).toBe(200);
      expect(triggerSourceInBackgroundMock).toHaveBeenCalled();
      expect(triggerSourceInBackgroundMock.mock.calls.at(-1)![0]).toBe(source);
    }
  });
});
