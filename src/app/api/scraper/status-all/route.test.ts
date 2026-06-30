/**
 * Unit tests for GET /api/scraper/status-all
 *
 * The route reads every scraper_status:<source> row via
 * @/workers/scrapers/status.getAllScrapingStatuses. We mock that helper.
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

let getAllScrapingStatusesMock: ReturnType<typeof mock> = mock(async () => ({}));

const statusState = {
  getAllScrapingStatuses: (..._args: unknown[]) =>
    getAllScrapingStatusesMock(..._args),
};

mock.module("@/workers/scrapers/status", () => statusState);

beforeAll(() => {
  // mocks registered at module load
});

beforeEach(() => {
  getAllScrapingStatusesMock = mock(async () => ({}));
  statusState.getAllScrapingStatuses = (..._args: unknown[]) =>
    getAllScrapingStatusesMock(..._args);
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/scraper/status-all ──────────────────────────────────────────

describe("GET /api/scraper/status-all", () => {
  test("returns 200 with is_scraping=false and empty sources when none are scraping", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      is_scraping: boolean;
      sources: Record<string, boolean>;
    };
    expect(body).toEqual({ is_scraping: false, sources: {} });
  });

  test("returns is_scraping=false when every source is false", async () => {
    getAllScrapingStatusesMock = mock(async () => ({
      "141jav": false,
      projectjav: false,
      pornrips: false,
    }));
    statusState.getAllScrapingStatuses = (..._args: unknown[]) =>
      getAllScrapingStatusesMock(..._args);
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as { is_scraping: boolean };
    expect(body.is_scraping).toBe(false);
  });

  test("returns is_scraping=true when any source is true", async () => {
    getAllScrapingStatusesMock = mock(async () => ({
      "141jav": false,
      projectjav: true,
      pornrips: false,
    }));
    statusState.getAllScrapingStatuses = (..._args: unknown[]) =>
      getAllScrapingStatusesMock(..._args);
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as {
      is_scraping: boolean;
      sources: Record<string, boolean>;
    };
    expect(body.is_scraping).toBe(true);
    expect(body.sources.projectjav).toBe(true);
  });

  test("passes through the full sources map", async () => {
    getAllScrapingStatusesMock = mock(async () => ({
      "141jav": true,
      projectjav: false,
      pornrips: true,
    }));
    statusState.getAllScrapingStatuses = (..._args: unknown[]) =>
      getAllScrapingStatusesMock(..._args);
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as {
      sources: Record<string, boolean>;
    };
    expect(body.sources).toEqual({
      "141jav": true,
      projectjav: false,
      pornrips: true,
    });
  });

  test("returns 500 with is_scraping=false and empty sources when the helper throws", async () => {
    getAllScrapingStatusesMock = mock(async () => {
      throw new Error("DB unavailable");
    });
    statusState.getAllScrapingStatuses = (..._args: unknown[]) =>
      getAllScrapingStatusesMock(..._args);
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as {
      is_scraping: boolean;
      sources: Record<string, boolean>;
    };
    expect(body).toEqual({ is_scraping: false, sources: {} });
  });
});
