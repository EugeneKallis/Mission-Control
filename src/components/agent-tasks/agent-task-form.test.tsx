/**
 * Tests for agent-task-form.tsx — Phase 2: cascading Provider/Model dropdowns.
 *
 * Verifies:
 *  (a) both providers appear in the Provider dropdown,
 *  (b) selecting a provider filters the Model dropdown to that provider's models,
 *  (c) selecting a model then submitting calls `onSubmit` with the matching
 *      `provider` + `model` (handles the duplicate-id-across-providers case),
 *  (d) fetch failure falls back to the original plain text inputs.
 */
import { describe, test, expect, afterEach, beforeEach, mock } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@/test-utils/render";
import { AgentTaskForm } from "./agent-task-form";

const mockOnSubmit = mock();
const mockOnCancel = mock();

/* Models with two providers sharing one model id (`deepseek-v4-flash`) —
 * exercises the provider-disambiguating selection path. */
const MOCK_MODELS = [
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    providerLabel: "DeepSeek",
    name: "DeepSeek V4 Flash",
    configured: true,
  },
  {
    id: "deepseek-v4-flash",
    provider: "opencode-go",
    providerLabel: "OpenCode Go",
    name: "DeepSeek V4 Flash",
    configured: true,
  },
  {
    id: "openai/gpt-5",
    provider: "openai",
    providerLabel: "OpenAI",
    name: "GPT-5",
    configured: true,
  },
];

let fetchMock: typeof globalThis.fetch;

describe("AgentTaskForm — model dropdowns", () => {
  beforeEach(() => {
    fetchMock = globalThis.fetch;
  });

  afterEach(() => {
    cleanup();
    mockOnSubmit.mockReset();
    mockOnCancel.mockReset();
    globalThis.fetch = fetchMock;
  });

  function renderForm() {
    return render(
      <AgentTaskForm
        resources={null}
        initial={null}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );
  }

  test("(a) renders all providers from Pi's model registry", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    renderForm();

    // Wait for the fetch to resolve (option text only appears after load)
    await screen.findByText("DeepSeek");
    expect(screen.getByText("OpenCode Go")).toBeTruthy();
    expect(screen.getByText("OpenAI")).toBeTruthy();
  });

  test("(b) selecting a provider filters the Model dropdown", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    renderForm();
    // Wait for the models to load before interacting
    await screen.findByText("DeepSeek");

    const modelSelect = screen.getByTestId("task-model") as HTMLSelectElement;
    // Default ("") → all models visible: 1 Default + 3 models (deepseek-v4-flash
    // appears once per provider — two entries with the same value).
    let modelOptions = within(modelSelect).getAllByRole("option");
    expect(modelOptions.length).toBe(4);

    // Selecting "openai" should filter the model dropdown to OpenAI's models only
    fireEvent.change(screen.getByTestId("task-provider"), {
      target: { value: "openai" },
    });

    const modelSelectAfter = screen.getByTestId("task-model") as HTMLSelectElement;
    const modelOptionsAfter = within(modelSelectAfter).getAllByRole("option");
    // 1 Default + the single GPT-5 model for openai
    expect(modelOptionsAfter.length).toBe(2);
  });

  test("(c) selecting a model then submitting emits the matching provider+model", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    renderForm();
    await screen.findByText("DeepSeek");

    // Pick the "openai" provider
    fireEvent.change(screen.getByTestId("task-provider"), {
      target: { value: "openai" },
    });
    // Select the only model visible: GPT-5
    fireEvent.change(screen.getByTestId("task-model"), {
      target: { value: "openai/gpt-5" },
    });

    // Satisfy the required form fields (name + prompt)
    fireEvent.change(screen.getByPlaceholderText("My Scheduled Task"), {
      target: { value: "T1" },
    });
    fireEvent.change(screen.getByPlaceholderText("What should the agent do?"), {
      target: { value: "P1" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload.provider).toBe("openai");
    expect(payload.model).toBe("openai/gpt-5");
  });

  test("(c2) duplicate-id across providers resolves to the selected provider", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    );

    renderForm();
    await screen.findByText("DeepSeek");

    // Pick the "opencode-go" provider — its only model `deepseek-v4-flash`
    // shares the id with the `deepseek` entry, so selecting it must resolve
    // to `opencode-go`, NOT the first `deepseek` duplicate.
    fireEvent.change(screen.getByTestId("task-provider"), {
      target: { value: "opencode-go" },
    });
    fireEvent.change(screen.getByTestId("task-model"), {
      target: { value: "deepseek-v4-flash" },
    });

    fireEvent.change(screen.getByPlaceholderText("My Scheduled Task"), {
      target: { value: "T2" },
    });
    fireEvent.change(screen.getByPlaceholderText("What should the agent do?"), {
      target: { value: "P2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload.provider).toBe("opencode-go");
    expect(payload.model).toBe("deepseek-v4-flash");
  });

  test("(d) fetch failure → fallback text inputs render", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));

    renderForm();

    // After the hook's fetch rejects, the form falls back to the original
    // text inputs (placeholders preserved for identification).
    await screen.findByPlaceholderText("anthropic");
    expect(screen.getByPlaceholderText("claude-sonnet-4")).toBeTruthy();
  });
});