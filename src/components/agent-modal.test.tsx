/**
 * Tests for AgentModal
 *
 * Covers:
 *  - Renders nothing when closed
 *  - Fetches hostnames from /api/agents/options on open
 *  - Renders hostnames as <option> elements
 *  - Run button is disabled until an agent is selected
 *  - Clicking Run calls onRun(macroId, hostname) then onClose
 *  - Cancel button calls onClose
 *  - Shows "No agents connected" when the hostnames list is empty
 *  - Handles fetch errors gracefully
 *
 * Uses `within(container)` for queries rather than global `screen`
 * because happy-dom's global `document` and @testing-library/dom's
 * `screen` binding don't always agree about `document.body`.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { render, within, fireEvent, waitFor } from "@/test-utils/render";
import { AgentModal } from "./agent-modal";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (url: any) =>
    Promise.resolve(handler(String(url)))) as typeof fetch;
}

function setup(props: Partial<React.ComponentProps<typeof AgentModal>> = {}) {
  const defaults = {
    open: true,
    onClose: () => {},
    macroId: 1,
    onRun: () => {},
  };
  return render(<AgentModal {...defaults} {...props} />);
}

describe("AgentModal", () => {
  test("renders nothing when open is false", () => {
    mockFetch(() => new Response("[]", { status: 200 }));
    const { container } = setup({ open: false });
    expect(container.querySelector("select")).toBeNull();
  });

  test("renders modal with title when open is true", async () => {
    mockFetch(() => new Response("[]", { status: 200 }));
    const { container } = setup();
    const view = within(container);
    expect(view.getByText("Select Agent")).toBeInTheDocument();
    expect(
      view.getByText("Select an agent to run this macro on."),
    ).toBeInTheDocument();
  });

  test("fetches /api/agents/options and lists hostnames", async () => {
    let fetchedUrl = "";
    mockFetch((url) => {
      fetchedUrl = url;
      return new Response(
        JSON.stringify([
          { id: 1, hostname: "alpha.local" },
          { id: 2, hostname: "beta.local" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const { container } = setup();
    await waitFor(() => expect(fetchedUrl).toBe("/api/agents/options"));

    const select = (await waitFor(
      () => container.querySelector("select") as HTMLSelectElement,
    )) as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll("option")).map(
      (o) => o.value,
    );
    expect(options).toContain("alpha.local");
    expect(options).toContain("beta.local");
  });

  test("Run button is disabled until an agent is selected", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify([{ id: 1, hostname: "alpha.local" }]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { container } = setup();
    const view = within(container);

    const runBtn = await view.findByRole("button", { name: "Run" });
    expect(runBtn).toBeDisabled();

    const select = (await waitFor(
      () => container.querySelector("select") as HTMLSelectElement,
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "alpha.local" } });

    expect(runBtn).not.toBeDisabled();
  });

  test("clicking Run calls onRun with macroId and selected hostname, then onClose", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify([{ id: 1, hostname: "alpha.local" }]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const receivedArgs: { current: { id: number; agent: string } | null } = { current: null };
    let closeCount = 0;

    const { container } = setup({
      macroId: 42,
      onRun: (id, agent) => {
        receivedArgs.current = { id, agent };
      },
      onClose: () => {
        closeCount++;
      },
    });

    const select = (await waitFor(
      () => container.querySelector("select") as HTMLSelectElement,
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "alpha.local" } });

    const runBtn = within(container).getByRole("button", { name: "Run" });
    fireEvent.click(runBtn);

    expect(receivedArgs.current).toEqual({ id: 42, agent: "alpha.local" });
    expect(closeCount).toBeGreaterThanOrEqual(1);
  });

  test("clicking Cancel calls onClose", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify([{ id: 1, hostname: "alpha.local" }]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    let closeCount = 0;
    const { container } = setup({
      onClose: () => {
        closeCount++;
      },
    });

    const select = (await waitFor(
      () => container.querySelector("select") as HTMLSelectElement,
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "alpha.local" } });
    expect(select.value).toBe("alpha.local");

    const cancelBtn = within(container).getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(closeCount).toBeGreaterThanOrEqual(1);
  });

  test("shows 'No agents connected' when fetch returns an empty list", async () => {
    mockFetch(() => new Response("[]", { status: 200 }));
    const { container } = setup();
    await waitFor(() =>
      expect(within(container).queryByText(/No agents connected/i)).not.toBeNull(),
    );
  });

  test("handles fetch errors by showing empty agent list", async () => {
    mockFetch(() => {
      throw new Error("network down");
    });
    const { container } = setup();
    await waitFor(() =>
      expect(within(container).queryByText(/No agents connected/i)).not.toBeNull(),
    );
  });

  test("does not fetch when modal is closed", () => {
    let fetchCount = 0;
    mockFetch(() => {
      fetchCount++;
      return new Response("[]", { status: 200 });
    });

    setup({ open: false });
    expect(fetchCount).toBe(0);
  });
});
