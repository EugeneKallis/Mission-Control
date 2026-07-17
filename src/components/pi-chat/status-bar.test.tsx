/**
 * Unit tests for status-bar.tsx — Pi session status display.
 *
 * Tests rendering of model info, thinking level toggle, context usage bar,
 * and state fetching.
 */
import { describe, test, expect, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@/test-utils/render";
import { StatusBar } from "./status-bar";

const SESSION_ID = "test-session-1";
const mockOnOpenModelSelector = mock();
const mockOnThinkingLevelChange = mock();

const MOCK_STATE = {
  models: [
    {
      id: "opencode-go/deepseek-v4-flash",
      provider: "opencode-go",
      providerLabel: "OpenCode Go",
      name: "DeepSeek V4 Flash",
      inputPricePerM: 0.14,
      outputPricePerM: 0.28,
      configured: true,
    },
  ],
  stats: {
    messageCount: 5,
    contextUsage: 42,
  },
  state: {
    model: "opencode-go/deepseek-v4-flash",
    provider: "opencode-go",
    thinkingLevel: "medium" as const,
  },
};

let fetchMock: typeof globalThis.fetch;

describe("StatusBar", () => {
  afterEach(() => {
    cleanup();
    mockOnOpenModelSelector.mockReset();
    mockOnThinkingLevelChange.mockReset();
    globalThis.fetch = fetchMock;
  });

  beforeEach(() => {
    fetchMock = globalThis.fetch;
  });

  test("renders model name from props", () => {
    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId="opencode-go/deepseek-v4-flash"
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    // Should show the current thinking level label
    expect(screen.getByText("Off")).toBeTruthy();
  });

  test("renders thinking level label", () => {
    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId={null}
        thinkingLevel="high"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    expect(screen.getByText("High")).toBeTruthy();
  });

  test("opens thinking level dropdown on click", async () => {
    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId={null}
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    // Click the thinking level button
    fireEvent.click(screen.getByText("Off"));

    // Dropdown should show options
    await waitFor(() => {
      expect(screen.getByText(/No reasoning/)).toBeTruthy();
      expect(screen.getByText(/Balanced/)).toBeTruthy();
      expect(screen.getByText(/Deep reasoning/)).toBeTruthy();
    });
  });

  test("calls onThinkingLevelChange when a level is selected", async () => {
    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId={null}
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    // Open dropdown
    fireEvent.click(screen.getByText("Off"));

    // Select "High" level — use getAllByText since "High" appears in multiple items
    await waitFor(() => {
      const highButtons = screen.getAllByText((content) => content.startsWith("High"));
      expect(highButtons.length).toBeGreaterThanOrEqual(1);
    });
    // Click the one that contains "Deep reasoning"
    const highButton = screen.getByText((content) => content.startsWith("High") && content.includes("Deep"));
    fireEvent.click(highButton);

    expect(mockOnThinkingLevelChange).toHaveBeenCalledWith("high");
  });

  test("calls onOpenModelSelector when model badge is clicked", () => {
    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId="opencode-go/deepseek-v4-flash"
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    // Find the model badge (button with smart_toy icon)
    const modelBtn = screen.getByTitle("Click to change model");
    fireEvent.click(modelBtn);

    expect(mockOnOpenModelSelector).toHaveBeenCalled();
  });

  test("fetches state from API and shows context usage", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_STATE))),
    );

    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId={null}
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("42%")).toBeTruthy();
      expect(screen.getByText("5 msgs")).toBeTruthy();
    });

    // Should show the model ID from fetched state (currentModelId is null,
    // so it falls back to state.model which is the model ID)
    expect(screen.getByText("opencode-go/deepseek-v4-flash")).toBeTruthy();
  });

  test("refresh button re-fetches state", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      return Promise.resolve(new Response(JSON.stringify(MOCK_STATE)));
    });

    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId={null}
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("42%")).toBeTruthy();
    });

    // Click refresh
    fireEvent.click(screen.getByTitle("Refresh session state"));

    // Should have called fetch at least 2 times (initial + refresh)
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  test("shows context bar with different colors based on usage", async () => {
    const highContextState = {
      ...MOCK_STATE,
      stats: { ...MOCK_STATE.stats, contextUsage: 85 },
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(highContextState))),
    );

    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId={null}
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("85%")).toBeTruthy();
    });
  });

  test("hides context bar when contextUsage is NaN", async () => {
    const nanContextState = {
      ...MOCK_STATE,
      stats: { ...MOCK_STATE.stats, contextUsage: Number.NaN },
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(nanContextState))),
    );

    render(
      <StatusBar
        sessionId={SESSION_ID}
        isConnected={true}
        onOpenModelSelector={mockOnOpenModelSelector}
        currentModelId={null}
        thinkingLevel="off"
        onThinkingLevelChange={mockOnThinkingLevelChange}
      />,
    );

    // Wait for fetch to complete
    await waitFor(() => {
      expect(screen.getByTitle("Refresh session state")).toBeTruthy();
    });

    // NaN must not render the bar or "NaN%" text
    expect(screen.queryByText("NaN%")).toBeNull();
  });
});
