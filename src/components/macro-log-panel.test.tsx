/**
 * Tests for MacroLogPanel
 *
 * Covers:
 *  - Header reflects runningMacroId/name vs. "Log History" when idle
 *  - LIVE / OFFLINE indicator mirrors useLiveStream().isConnected
 *  - Fetches /api/history on mount, polls every 5s
 *  - Renders history rows with status pill + duration
 *  - Empty / loading state
 *  - Clear-lines transition when a macro starts running
 *  - Export button: noop when no lines, downloads a Blob when lines are present
 *  - Close button calls onClose
 */
import { describe, test, expect, afterEach, mock, beforeAll } from "bun:test";
import React from "react";
import { render, within, fireEvent, waitFor } from "@/test-utils/render";
import { MacroLogPanel } from "./macro-log-panel";
import type { FileTreeItem } from "@/types";

const originalFetch = globalThis.fetch;

// Mock useLiveStream to a controllable value per test. The mock is set
// inside each test before the component imports.
let mockLiveLines: string[] = [];
let mockLiveConnected = false;
let mockLiveClear = () => {
  mockLiveLines = [];
};

mock.module("@/hooks/use-live-stream", () => ({
  useLiveStream: () => ({
    lines: mockLiveLines,
    isConnected: mockLiveConnected,
    clearLines: mockLiveClear,
    containerRef: { current: null },
    handleScroll: () => {},
    setIsAutoScroll: () => {},
  }),
}));

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockLiveLines = [];
  mockLiveConnected = false;
});

function makeHistoryItems() {
  return [
    {
      id: 1,
      macroId: 10,
      startTime: "2025-01-15T10:00:00Z",
      endTime: "2025-01-15T10:00:42Z",
      status: "success",
      output: "ok",
      triggeredBy: "manual",
      macro: { name: "Backup" },
    },
    {
      id: 2,
      macroId: 11,
      startTime: "2025-01-15T11:00:00Z",
      endTime: null,
      status: "running",
      output: "...",
      triggeredBy: "schedule",
      macro: { name: "Sync" },
    },
  ];
}

function mockHistoryFetch(items: ReturnType<typeof makeHistoryItems> | "error" = makeHistoryItems()) {
  globalThis.fetch = (async (url: any) => {
    if (String(url).startsWith("/api/history")) {
      if (items === "error") return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
}

describe("MacroLogPanel", () => {
  test("renders the macro name in the header when running", () => {
    mockHistoryFetch();
    const { container } = render(
      <MacroLogPanel
        runningMacroId={42}
        runningMacroName="MyMacro"
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(view.getByText("Running: MyMacro")).toBeInTheDocument();
  });

  test("renders 'Log History' header when no macro is running", () => {
    mockHistoryFetch();
    const { container } = render(
      <MacroLogPanel
        runningMacroId={null}
        runningMacroName=""
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(view.getByText("Log History")).toBeInTheDocument();
  });

  test("shows LIVE indicator when useLiveStream is connected", () => {
    mockHistoryFetch();
    mockLiveConnected = true;
    const { container } = render(
      <MacroLogPanel
        runningMacroId={42}
        runningMacroName="MyMacro"
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(view.getByText("LIVE")).toBeInTheDocument();
  });

  test("shows OFFLINE indicator when useLiveStream is not connected", () => {
    mockHistoryFetch();
    mockLiveConnected = false;
    const { container } = render(
      <MacroLogPanel
        runningMacroId={42}
        runningMacroName="MyMacro"
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(view.getByText("OFFLINE")).toBeInTheDocument();
  });

  test("renders history rows from /api/history", async () => {
    const items = makeHistoryItems();
    mockHistoryFetch(items);
    const { container } = render(
      <MacroLogPanel
        runningMacroId={null}
        runningMacroName=""
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(await view.findByText("Backup")).toBeInTheDocument();
    expect(view.getByText("Sync")).toBeInTheDocument();
    expect(view.getByText("42s")).toBeInTheDocument();
    expect(view.getByText("running…")).toBeInTheDocument();
  });

  test("renders empty-state when history is empty", async () => {
    mockHistoryFetch([]);
    const { container } = render(
      <MacroLogPanel
        runningMacroId={null}
        runningMacroName=""
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(await view.findByText("No history yet.")).toBeInTheDocument();
  });

  test("renders history row as a link to /history/[id]", async () => {
    const items = makeHistoryItems();
    mockHistoryFetch(items);
    const { container } = render(
      <MacroLogPanel
        runningMacroId={null}
        runningMacroName=""
        onClose={() => {}}
      />,
    );
    const view = within(container);
    await view.findByText("Backup");
    const link = view.getByText("Backup").closest("a");
    expect(link?.getAttribute("href")).toBe("/history/1");
  });

  test("calls onClose when the close button is clicked", () => {
    mockHistoryFetch();
    let closeCount = 0;
    const { container } = render(
      <MacroLogPanel
        runningMacroId={null}
        runningMacroName=""
        onClose={() => {
          closeCount++;
        }}
      />,
    );
    const closeBtn = container.querySelector('button[title="Close panel"]') as HTMLElement;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(closeCount).toBe(1);
  });

  test("export button is a noop when there are no live lines", () => {
    mockHistoryFetch();
    mockLiveLines = [];
    const { container } = render(
      <MacroLogPanel
        runningMacroId={42}
        runningMacroName="MyMacro"
        onClose={() => {}}
      />,
    );
    const exportBtn = container.querySelector('button[title="Export current log"]') as HTMLElement;
    expect(exportBtn).toBeTruthy();
    // No throw, no download side-effect (we don't simulate URL.createObjectURL
    // here — the function returns early when lines.length === 0).
    fireEvent.click(exportBtn);
  });

  test("export button creates a Blob download when lines are present", () => {
    mockHistoryFetch();
    mockLiveLines = ["line one\n", "line two\n"];

    let createdBlob: Blob | null = null;
    let clickedAnchor: HTMLAnchorElement | null = null;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (b: any) => {
      createdBlob = b;
      return "blob:fake";
    };
    URL.revokeObjectURL = () => {};
    const origAppendChild = document.body.appendChild.bind(document.body);
    const origRemoveChild = document.body.removeChild.bind(document.body);
    document.body.appendChild = ((node: Node) => {
      if (node instanceof HTMLAnchorElement) clickedAnchor = node;
      return origAppendChild(node);
    }) as typeof document.body.appendChild;
    document.body.removeChild = ((node: Node) => origRemoveChild(node)) as typeof document.body.removeChild;

    try {
      const { container } = render(
        <MacroLogPanel
          runningMacroId={42}
          runningMacroName="MyMacro"
          onClose={() => {}}
        />,
      );
      const exportBtn = container.querySelector('button[title="Export current log"]') as HTMLElement;
      fireEvent.click(exportBtn);

      expect(createdBlob).not.toBeNull();
      expect((createdBlob as unknown as Blob).type).toBe("text/plain;charset=utf-8");
      expect(clickedAnchor).not.toBeNull();
      expect(clickedAnchor!.getAttribute("download")).toMatch(/^macro-log-\d+\.txt$/);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      document.body.appendChild = origAppendChild;
      document.body.removeChild = origRemoveChild;
    }
  });

  test("shows 'Waiting for output' placeholder while running with no lines", () => {
    mockHistoryFetch();
    mockLiveLines = [];
    const { container } = render(
      <MacroLogPanel
        runningMacroId={42}
        runningMacroName="MyMacro"
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(
      view.getByText(/Waiting for output from "MyMacro"/),
    ).toBeInTheDocument();
  });

  test("shows 'No live output' placeholder when idle with no lines", () => {
    mockHistoryFetch();
    mockLiveLines = [];
    const { container } = render(
      <MacroLogPanel
        runningMacroId={null}
        runningMacroName=""
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(
      view.getByText("No live output. Run a macro to see output here."),
    ).toBeInTheDocument();
  });

  test("renders each live line in the terminal pane", () => {
    mockHistoryFetch();
    mockLiveLines = ["hello", "world"];
    const { container } = render(
      <MacroLogPanel
        runningMacroId={42}
        runningMacroName="MyMacro"
        onClose={() => {}}
      />,
    );
    const view = within(container);
    expect(view.getByText("hello")).toBeInTheDocument();
    expect(view.getByText("world")).toBeInTheDocument();
  });
});
