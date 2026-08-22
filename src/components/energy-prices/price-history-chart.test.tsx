/**
 * Tests for <PriceHistoryChart /> — chart only renders a sliced window.
 *
 * Network is stubbed via the global `fetch` so we don't need MSW.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
} from "bun:test";
import { render, screen, waitFor } from "@/test-utils/render";
import { PriceHistoryChart } from "./price-history-chart";
import userEvent from "@testing-library/user-event";

const originalFetch = globalThis.fetch;

type FetchInit = Parameters<typeof fetch>[1];

function makeFetch(responses: Map<string | RegExp, unknown>) {
  return mock(async (input: RequestInfo | URL, _init?: FetchInit) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, payload] of responses.entries()) {
      if (
        (typeof pattern === "string" && url.includes(pattern)) ||
        pattern instanceof RegExp && pattern.test(url)
      ) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("<PriceHistoryChart />", () => {
  test("renders the empty state when the API returns no suppliers", async () => {
    globalThis.fetch = makeFetch(
      new Map([
        [/energy-prices\/history/, { days: 30, targetRate: null, sinceIso: new Date().toISOString(), suppliers: [] }],
      ]),
    );
    render(<PriceHistoryChart days={30} targetRate={null} onChangeDays={() => {}} />);
    expect(await screen.findByTestId("price-history-empty")).toBeInTheDocument();
  });

  test("renders one circle per data point when chart has data", async () => {
    const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
    globalThis.fetch = makeFetch(
      new Map([
        [/energy-prices\/history/, {
          days: 30,
          targetRate: null,
          sinceIso: new Date(Date.now() - 30 * 86400000).toISOString(),
          suppliers: [
            { name: "Acme", points: [{ t: t(20 * 86400000), rate: 10.0 }, { t: t(10 * 86400000), rate: 10.5 }] },
            { name: "Beta", points: [{ t: t(15 * 86400000), rate: 12.0 }] },
          ],
        }],
      ]),
    );
    const { container } = render(
      <PriceHistoryChart days={30} targetRate={null} onChangeDays={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("price-history-empty")).not.toBeInTheDocument();
    });
    // 2 + 1 = 3 dots
    const circles = container.querySelectorAll("svg circle");
    expect(circles.length).toBe(3);
  });

  test("renders the target-rate reference line when targetRate is set", async () => {
    const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
    // Keep target inside the y-range. Chart pads ±10% so rates 9-11
    // produce a window of ~8.8-11.2; target 10.5 lands inside.
    globalThis.fetch = makeFetch(
      new Map([
        [/energy-prices\/history/, {
          days: 30,
          targetRate: 10.5,
          sinceIso: new Date(Date.now() - 30 * 86400000).toISOString(),
          suppliers: [
            { name: "Acme", points: [{ t: t(10 * 86400000), rate: 9.0 }, { t: t(2 * 86400000), rate: 11.0 }] },
          ],
        }],
      ]),
    );
    render(<PriceHistoryChart days={30} targetRate={10.5} onChangeDays={() => {}} />);
    expect(await screen.findByTestId("target-line")).toBeInTheDocument();
  });

  test("omits the target line when targetRate is null", async () => {
    const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
    globalThis.fetch = makeFetch(
      new Map([
        [/energy-prices\/history/, {
          days: 30,
          targetRate: null,
          sinceIso: new Date(Date.now() - 30 * 86400000).toISOString(),
          suppliers: [
            { name: "Acme", points: [{ t: t(2 * 86400000), rate: 10.4 }] },
          ],
        }],
      ]),
    );
    render(<PriceHistoryChart days={30} targetRate={null} onChangeDays={() => {}} />);
    await waitFor(() => expect(screen.queryByTestId("target-line")).not.toBeInTheDocument());
  });

  test("clicking a range pill fires onChangeDays", async () => {
    globalThis.fetch = makeFetch(
      new Map([
        [/energy-prices\/history/, {
          days: 7,
          targetRate: null,
          sinceIso: new Date(Date.now() - 7 * 86400000).toISOString(),
          suppliers: [],
        }],
      ]),
    );
    const onChange = mock((_d: number) => {});
    render(<PriceHistoryChart days={7} targetRate={null} onChangeDays={onChange} />);
    const user = userEvent.setup();
    // wait for empty state since no suppliers were seeded
    await screen.findByTestId("price-history-empty");
    // `7d` pill — current selection has aria-pressed=true
    const allButtons = screen.getAllByRole("button");
    // skip the legend toggle (none here); the only ones are the 5 range pills
    expect(allButtons.length).toBeGreaterThanOrEqual(5);
    const oneYearBtn = allButtons.find((b) => b.textContent?.trim() === "1y")!;
    await user.click(oneYearBtn);
    expect(onChange).toHaveBeenCalledWith(365);
  });

  test("legend click toggles a supplier line off (button aria-pressed flips)", async () => {
    const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
    globalThis.fetch = makeFetch(
      new Map([
        [/energy-prices\/history/, {
          days: 30,
          targetRate: null,
          sinceIso: new Date(Date.now() - 30 * 86400000).toISOString(),
          suppliers: [
            { name: "Acme", points: [{ t: t(10 * 86400000), rate: 10.0 }] },
            { name: "Beta", points: [{ t: t(5 * 86400000), rate: 12.0 }] },
          ],
        }],
      ]),
    );
    render(<PriceHistoryChart days={30} targetRate={null} onChangeDays={() => {}} />);
    // Acme and Beta are in `recent` and both show in legend
    const acme = await screen.findByRole("button", { name: /Acme/ });
    expect(acme).toHaveAttribute("aria-pressed", "true");
    const user = userEvent.setup();
    await user.click(acme);
    expect(acme).toHaveAttribute("aria-pressed", "false");
  });

  test("renders an error message when the fetch fails", async () => {
    globalThis.fetch = mock(async () => new Response("not json", { status: 500 })) as unknown as typeof fetch;
    render(<PriceHistoryChart days={30} targetRate={null} onChangeDays={() => {}} />);
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
  });

  test("re-fetches when the `days` prop changes", async () => {
    const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          days: 30,
          targetRate: null,
          sinceIso: new Date().toISOString(),
          suppliers: [
            { name: "Acme", points: [{ t: t(2 * 86400000), rate: 10.0 }] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { rerender } = render(
      <PriceHistoryChart days={30} targetRate={null} onChangeDays={() => {}} />,
    );
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    const callsAfterFirst = fetchMock.mock.calls.length;
    rerender(<PriceHistoryChart days={7} targetRate={null} onChangeDays={() => {}} />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst));
  });
});
