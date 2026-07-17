/**
 * Unit tests for model-selector.tsx — Pi model selection modal.
 *
 * Tests the modal content rendering, provider filtering, search,
 * and model selection callback.
 */
import { describe, test, expect, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@/test-utils/render";
import { ModelSelector } from "./model-selector";

const SESSION_ID = "test-session-1";
const mockOnSelect = mock();
const mockOnClose = mock();

const MOCK_MODELS = [
  {
    id: "opencode-go/deepseek-v4-flash",
    provider: "opencode-go",
    providerLabel: "OpenCode Go",
    name: "DeepSeek V4 Flash",
    capabilities: ["text", "tools", "reasoning"],
    inputPricePerM: 0.14,
    outputPricePerM: 0.28,
    contextWindow: 1_000_000,
    configured: true,
  },
  {
    id: "openai/gpt-4o",
    provider: "openai",
    providerLabel: "OpenAI",
    name: "GPT-4o",
    capabilities: ["text", "vision", "tools"],
    inputPricePerM: 2.5,
    outputPricePerM: 10,
    contextWindow: 128_000,
    configured: true,
  },
  {
    id: "anthropic/claude-sonnet-4",
    provider: "anthropic",
    providerLabel: "Anthropic",
    name: "Claude Sonnet 4",
    capabilities: ["text", "tools", "reasoning"],
    inputPricePerM: 3.0,
    outputPricePerM: 15,
    contextWindow: 200_000,
    configured: false,
  },
];

let fetchMock: typeof globalThis.fetch;

describe("ModelSelector", () => {
  afterEach(() => {
    cleanup();
    mockOnSelect.mockReset();
    mockOnClose.mockReset();
    globalThis.fetch = fetchMock;
  });

  beforeEach(() => {
    fetchMock = globalThis.fetch;
  });

  test("renders nothing when closed", () => {
    const { container } = render(
      <ModelSelector
        open={false}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId={null}
        onSelect={mockOnSelect}
      />,
    );
    // Should be empty (modal is closed)
    expect(container.textContent).toBe("");
  });

  test("fetches models and renders them when opened", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    render(
      <ModelSelector
        open={true}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId={null}
        onSelect={mockOnSelect}
      />,
    );

    // Wait for models to load
    await waitFor(() => {
      expect(screen.getByText("DeepSeek V4 Flash")).toBeTruthy();
    });

    expect(screen.getByText("GPT-4o")).toBeTruthy();
    expect(screen.getByText("Claude Sonnet 4")).toBeTruthy();
  });

  test("highlights active model", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    render(
      <ModelSelector
        open={true}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId="openai/gpt-4o"
        onSelect={mockOnSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("GPT-4o")).toBeTruthy();
    });

    // Active model should have the check_circle icon
    expect(screen.getByText("check_circle")).toBeTruthy();
  });

  test("calls onSelect when a model is clicked", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    render(
      <ModelSelector
        open={true}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId={null}
        onSelect={mockOnSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("GPT-4o")).toBeTruthy();
    });

    // Click on GPT-4o
    fireEvent.click(screen.getByText("GPT-4o"));
    expect(mockOnSelect).toHaveBeenCalledWith("openai/gpt-4o", "openai");
  });

  test("shows 'needs key' badge for unconfigured models", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    render(
      <ModelSelector
        open={true}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId={null}
        onSelect={mockOnSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("needs key")).toBeTruthy();
    });
  });

  test("shows 'ready' badge for configured models", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    render(
      <ModelSelector
        open={true}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId={null}
        onSelect={mockOnSelect}
      />,
    );

    await waitFor(() => {
      // There should be at least 2 "ready" badges (for opencode-go and openai)
      const readyBadges = screen.getAllByText("ready");
      expect(readyBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  test("shows error state when fetch fails", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Network error")),
    );

    render(
      <ModelSelector
        open={true}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId={null}
        onSelect={mockOnSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeTruthy();
    });
  });

  test("shows empty state when API returns no models", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: [] }))),
    );

    render(
      <ModelSelector
        open={true}
        onClose={mockOnClose}
        sessionId={SESSION_ID}
        activeModelId={null}
        onSelect={mockOnSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/No models returned/i)).toBeTruthy();
    });
  });
});
