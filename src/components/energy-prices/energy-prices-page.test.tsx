/**
 * Integration test: <EnergyPricesPage /> mounts the
 * <PriceHistoryChart /> at the bottom of the page with the
 * active target rate and a persisted range.
 *
 * All network calls (latest snapshot + history) are stubbed so
 * we never reach Playwright, the dev DB, or a real HTTP server.
 */

import {
  describe,
  test,
  expect,
  mock,
  afterEach,
} from "bun:test";
import { render, screen, waitFor } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";
import { EnergyPricesPage } from "./energy-prices-page";
import { PRICE_HISTORY_STORAGE_KEY } from "./price-history-chart";

const originalFetch = globalThis.fetch;

const LATEST = {
  offers: [
    {
      id: 1,
      supplier: "Acme Energy",
      rate: 10.5,
      monthlyCost: 78.75,
      savings: -4.5,
      plan: "12-month fixed",
      billingCycles: 12,
      recs: 100,
      phone: "1-800-555-0100",
      isActive: true,
      fetchedAt: new Date().toISOString(),
    },
    {
      id: 2,
      supplier: "Eversource - Standard Service",
      rate: 13.5,
      monthlyCost: 101.25,
      savings: 0,
      plan: "Standard",
      billingCycles: null,
      recs: 50,
      phone: "",
      isActive: true,
      fetchedAt: new Date().toISOString(),
    },
  ],
  targetRate: 11.0,
  hasBetter: true,
  betterCount: 1,
  lastScrapedAt: new Date().toISOString(),
};

const HISTORY_30 = {
  days: 30,
  targetRate: 11.0,
  sinceIso: new Date(Date.now() - 30 * 86400000).toISOString(),
  suppliers: [
    {
      name: "Acme Energy",
      points: [
        { t: new Date(Date.now() - 20 * 86400000).toISOString(), rate: 10.0 },
        { t: new Date(Date.now() - 5 * 86400000).toISOString(), rate: 10.5 },
      ],
    },
    {
      name: "Beta Power",
      points: [{ t: new Date(Date.now() - 5 * 86400000).toISOString(), rate: 11.2 }],
    },
  ],
};

function mockFetchWith(opts: {
  latest?: typeof LATEST;
  history?: typeof HISTORY_30;
}) {
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/energy-prices/refresh")) {
      return new Response(JSON.stringify({ ok: true, count: 0, offers: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/energy-prices/history")) {
      return new Response(JSON.stringify(opts.history ?? HISTORY_30), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/energy-prices") && method === "GET") {
      return new Response(JSON.stringify(opts.latest ?? LATEST), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/energy-prices/target") && method === "PUT") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return new Response(JSON.stringify({ targetRate: body.rate }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
});

describe("<EnergyPricesPage /> chart integration", () => {
  test("renders the chart at the bottom once data loads", async () => {
    mockFetchWith({ latest: LATEST, history: HISTORY_30 });
    render(<EnergyPricesPage />);

    // First the latest-offer table appears
    expect(await screen.findByText("Acme Energy")).toBeInTheDocument();

    // Then the chart mounts below the table
    expect(await screen.findByTestId("price-history-chart")).toBeInTheDocument();
    expect(await screen.findByText("Rate History")).toBeInTheDocument();
  });

  test("chart receives the user's target rate from the same page state", async () => {
    mockFetchWith({ latest: LATEST, history: HISTORY_30 });
    render(<EnergyPricesPage />);
    await screen.findByTestId("price-history-chart");
    // Target line is rendered when targetRate (11.0) is inside the y-range
    expect(await screen.findByTestId("target-line")).toBeInTheDocument();
  });

  test("clicking a range pill refetches with the new day count", async () => {
    let lastHistoryUrl: string | null = null;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/energy-prices/history")) {
        lastHistoryUrl = url;
        return new Response(JSON.stringify(HISTORY_30), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/energy-prices") && method === "GET") {
        return new Response(JSON.stringify(LATEST), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/energy-prices/target") && method === "PUT") {
        return new Response(JSON.stringify({ targetRate: 11 }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/energy-prices/refresh")) {
        return new Response(JSON.stringify({ ok: true, count: 0, offers: [] }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    render(<EnergyPricesPage />);
    await screen.findByTestId("price-history-chart");
    await waitFor(() => expect(lastHistoryUrl).not.toBeNull());
    expect(lastHistoryUrl ?? "").toContain("days=30"); // default

    const user = userEvent.setup();
    const oneYearBtn = (await screen.findAllByRole("button"))
      .find((b) => b.textContent?.trim() === "1y");
    expect(oneYearBtn).toBeDefined();
    await user.click(oneYearBtn!);

    await waitFor(() => expect(lastHistoryUrl).toContain("days=365"));
  });

  test("range persists across remounts via localStorage", async () => {
    // Pre-seed the persisted choice before the page mounts
    localStorage.setItem(PRICE_HISTORY_STORAGE_KEY, "7");

    let firstUrlAfterMount: string | null = null;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/energy-prices/history") && firstUrlAfterMount === null) {
        firstUrlAfterMount = url;
      }
      const body = url.includes("/history")
        ? HISTORY_30
        : LATEST;
      return new Response(JSON.stringify(body), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    render(<EnergyPricesPage />);
    await screen.findByTestId("price-history-chart");
    // After the post-mount effect reads localStorage, the chart
    // re-fetches with days=7. Allow it time to land.
    await waitFor(() => {
      expect(firstUrlAfterMount).not.toBeNull();
      expect(firstUrlAfterMount ?? "").toContain("days=7");
    });
  });

  test("range click persists the chosen value back to localStorage", async () => {
    mockFetchWith({ latest: LATEST, history: HISTORY_30 });
    render(<EnergyPricesPage />);
    await screen.findByTestId("price-history-chart");
    const user = userEvent.setup();
    const pill = (await screen.findAllByRole("button"))
      .find((b) => b.textContent?.trim() === "60d");
    await user.click(pill!);
    expect(localStorage.getItem(PRICE_HISTORY_STORAGE_KEY)).toBe("60");
  });
});
