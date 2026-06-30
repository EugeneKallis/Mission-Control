/**
 * Unit tests for GET /api/scraper/status
 *
 * The route reads the scraper_status:<source> row in the `settings` table
 * via @/workers/scrapers/status. We mock that helper module so we don't
 * need to seed the settings table for each scenario.
 *
 * NOTE: the mock object must include every export from the real module,
 * because bun's test runner shares the module cache across test files
 * in the same process. A mock that omits an export will cause
 * `SyntaxError: Export named 'X' not found` in any other test file
 * that imports X from the same module.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  beforeEach,
} from "bun:test";
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

// `mock.module` is hoisted to the top of the file by bun.

let getScrapingStatusMock: ReturnType<typeof mock> = mock(async () => false);

const statusState = {
  getScrapingStatus: (..._args: unknown[]) => getScrapingStatusMock(..._args),
  // The next two are placeholders for cross-file module-cache safety.
  // `just test` runs with `--isolate` so they shouldn't be hit, but
  // if a different runner is used (e.g. `bun test` directly) they
  // prevent `Export not found` errors in sibling test files.
  getAllScrapingStatuses: async () => ({}),
  setScrapingStatus: async () => {},
  withScrapingStatus: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
};

mock.module("@/workers/scrapers/status", () => statusState);

beforeAll(() => {
  // mocks registered at module load
});

beforeEach(() => {
  getScrapingStatusMock = mock(async (_source: string) => false);
  statusState.getScrapingStatus = (..._args: unknown[]) =>
    getScrapingStatusMock(..._args);
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/scraper/status ──────────────────────────────────────────────

describe("GET /api/scraper/status", () => {
  test("returns 200 with is_scraping=false when not scraping", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/status?source=141jav"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      is_scraping: boolean;
      source: string;
    };
    expect(body).toEqual({ is_scraping: false, source: "141jav" });
  });

  test("returns is_scraping=true when the status helper returns true", async () => {
    getScrapingStatusMock = mock(async (_source: string) => true);
    statusState.getScrapingStatus = (..._args: unknown[]) =>
      getScrapingStatusMock(..._args);
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/status?source=projectjav"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      is_scraping: boolean;
      source: string;
    };
    expect(body).toEqual({ is_scraping: true, source: "projectjav" });
  });

  test("defaults source to 141jav when query param is missing", async () => {
    getScrapingStatusMock = mock(async (source: string) => source === "141jav");
    statusState.getScrapingStatus = (..._args: unknown[]) =>
      getScrapingStatusMock(..._args);
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/status"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { source: string };
    expect(body.source).toBe("141jav");
    // The helper should have been called with the default source.
    expect(getScrapingStatusMock.mock.calls[0][0]).toBe("141jav");
  });

  test("passes the source query param through to the helper", async () => {
    const { GET } = await loadRoute();
    await GET(getRequest("/api/scraper/status?source=pornrips"));
    expect(getScrapingStatusMock.mock.calls).toHaveLength(1);
    expect(getScrapingStatusMock.mock.calls[0][0]).toBe("pornrips");
  });

  test("returns 500 with is_scraping=false when the helper throws", async () => {
    getScrapingStatusMock = mock(async (_source: string) => {
      throw new Error("DB unavailable");
    });
    statusState.getScrapingStatus = (..._args: unknown[]) =>
      getScrapingStatusMock(..._args);
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/status?source=141jav"));
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as {
      is_scraping: boolean;
      source: string;
    };
    expect(body).toEqual({ is_scraping: false, source: "141jav" });
  });
});
