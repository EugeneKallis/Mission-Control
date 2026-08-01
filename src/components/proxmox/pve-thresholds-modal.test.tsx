/**
 * Unit tests for the PVE thresholds modal.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { PveThresholdsModal } from "./pve-thresholds-modal";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

function mockFetch(config: { cpu: number; memory: number; storage: number }) {
  globalThis.fetch = mock(async (url: string) => {
    if (url.includes("/api/pve/thresholds")) {
      return new Response(JSON.stringify({ config, defaults: config }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("PveThresholdsModal", () => {
  test("loads and displays the current thresholds", async () => {
    mockFetch({ cpu: 75, memory: 85, storage: 90 });
    const onClose = mock();
    const onSaved = mock();

    render(<PveThresholdsModal open onClose={onClose} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("75")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("85")).toBeInTheDocument();
    expect(screen.getByDisplayValue("90")).toBeInTheDocument();
  });

  test("saves updated thresholds via PUT", async () => {
    let savedBody: unknown = null;
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/pve/thresholds")) {
        if (init?.method === "PUT") {
          savedBody = JSON.parse(init.body as string);
          return new Response(JSON.stringify({ config: savedBody }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ config: { cpu: 80, memory: 80, storage: 80 } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const onSaved = mock();
    const onClose = mock();
    render(<PveThresholdsModal open onClose={onClose} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByLabelText("CPU threshold")).toBeInTheDocument();
    });

    const cpuInput = screen.getByLabelText("CPU threshold") as HTMLInputElement;
    fireEvent.change(cpuInput, { target: { value: "70" } });
    expect(cpuInput.value).toBe("70");

    fireEvent.click(screen.getByRole("button", { name: "Save Thresholds" }));

    await waitFor(() => {
      expect(savedBody).toEqual({ cpu: 70, memory: 80, storage: 80 });
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
