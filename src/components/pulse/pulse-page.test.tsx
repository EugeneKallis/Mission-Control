import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@/test-utils/render";
import { PULSE_URL, PulsePage, type PulseViewState } from "./pulse-page";

afterEach(cleanup);

function renderState(state: PulseViewState) {
  return render(<PulsePage state={state} />);
}

describe("PulsePage", () => {
  test.each([
    ["loading", /Loading Pulse/i],
    ["unavailable", /Pulse is unavailable/i],
    ["fallback", /Pulse is available separately/i],
  ] as const)("renders the %s state", (state, heading) => {
    renderState(state);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Pulse directly/i }).getAttribute("href")).toBe(PULSE_URL);
    expect(screen.queryByRole("iframe")).not.toBeInTheDocument();
  });

  test("renders Pulse's UI in a full-height iframe when available", () => {
    const { container } = renderState("available");
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe(PULSE_URL);
    expect(iframe?.getAttribute("title")).toMatch(/Pulse/i);
    expect(screen.getByRole("link", { name: /Open separately/i }).getAttribute("href")).toBe(PULSE_URL);
  });
});
