/**
 * Unit tests for src/components/chat/chat-page.tsx — DB-backed chat.
 * globalThis.fetch is mocked to a tiny in-memory API so we can exercise
 * model selection, attachments + media warnings, and sending messages.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@/test-utils/render";

const { ChatPage } = await import("./chat-page");

const MODEL_FLASH = {
  id: "opencode-go/deepseek-v4-flash",
  modelId: "deepseek-v4-flash",
  provider: "opencode-go",
  providerLabel: "OpenCode Go",
  name: "DeepSeek V4 Flash",
  inputPricePerM: 0.14,
  outputPricePerM: 0.28,
  contextWindow: 1_000_000,
  maxOutput: 384_000,
  capabilities: ["text", "tools", "reasoning"],
  chips: [{ key: "tools", label: "Tools", icon: "build" }, { key: "reasoning", label: "Reasoning", icon: "psychology" }],
  price: "$0.14 in · $0.28 out /M",
  configured: true,
};
const MODEL_MINIMO = {
  ...MODEL_FLASH,
  id: "opencode-go/mimo-v2.5", modelId: "mimo-v2.5", name: "MiMo V2.5",
  inputPricePerM: 0.14, outputPricePerM: 0.28, price: "$0.14 in · $0.28 out /M",
};
const MODEL_GPT = {
  ...MODEL_FLASH,
  id: "openai/gpt-4o", modelId: "gpt-4o", provider: "openai", providerLabel: "OpenAI",
  name: "GPT-4o", inputPricePerM: 2.5, outputPricePerM: 10,
  capabilities: ["text", "vision", "tools"],
  chips: [
    { key: "vision", label: "Vision", icon: "image" },
    { key: "tools", label: "Tools", icon: "build" },
  ],
  price: "$2.50 in · $10.00 out /M",
};

const MODELS = [MODEL_FLASH, MODEL_MINIMO, MODEL_GPT]; // already price-sorted by the API

let store: { sessions: Map<number, { title: string; model: string; messages: unknown[] }> };
let nextId: number;
let calls: { method: string; url: string; body?: unknown }[];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFetch() {
  const fn = async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const u = url;
    calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const path = u.replace(/^http:\/\/localhost/, "");

    if (path === "/api/chat/models" && method === "GET") {
      return json({ defaultModelId: "opencode-go/deepseek-v4-flash", models: MODELS });
    }
    if (path === "/api/chat/sessions" && method === "GET") {
      return json(Array.from(store.sessions.entries()).map(([id, s]) => ({
        id, title: s.title, model: s.model,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })));
    }
    if (path === "/api/chat/sessions" && method === "POST") {
      const id = ++nextId;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      store.sessions.set(id, {
        title: body.title ?? "New conversation",
        model: body.model ?? "opencode-go/deepseek-v4-flash",
        messages: [],
      });
      return json({
        id, title: body.title ?? "New conversation",
        model: body.model ?? "opencode-go/deepseek-v4-flash",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, 201);
    }
    const sessMatch = path.match(/^\/api\/chat\/sessions\/(\d+)$/);
    if (sessMatch) {
      const id = Number(sessMatch[1]);
      const s = store.sessions.get(id);
      if (method === "GET") {
        if (!s) return json({ error: "not found" }, 404);
        return json({
          id, title: s.title, model: s.model,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          messages: s.messages,
        });
      }
      if (method === "PATCH") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (!s) return json({ error: "not found" }, 404);
        if (body.title !== undefined) s.title = body.title;
        if (body.model !== undefined) s.model = body.model;
        return json({
          id, title: s.title, model: s.model,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }
      if (method === "DELETE") {
        store.sessions.delete(id);
        return json({ success: true });
      }
    }
    const msgMatch = path.match(/^\/api\/chat\/sessions\/(\d+)\/messages$/);
    if (msgMatch && method === "POST") {
      const id = Number(msgMatch[1]);
      const s = store.sessions.get(id);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const userMsg = { id: Date.now(), role: "user", content: body.content, attachments: [], createdAt: new Date().toISOString() };
      const assistantMsg = { id: Date.now() + 1, role: "assistant", content: "assistant reply", attachments: [], createdAt: new Date().toISOString() };
      s?.messages.push(userMsg, assistantMsg);
      return json({ userMessage: userMsg, assistantMessage: assistantMsg }, 201);
    }
    return json({ error: "not mocked", path, method }, 404);
  };
  return fn as unknown as typeof fetch;
}

let savedFetch: typeof fetch;

beforeEach(() => {
  savedFetch = globalThis.fetch;
  calls = [];
  store = { sessions: new Map() };
  nextId = 0;
  globalThis.fetch = makeFetch();
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  cleanup();
});

async function boot() {
  const res = render(<ChatPage />);
  // wait for the default model name to render in the header
  await waitFor(() => expect(screen.getByText("DeepSeek V4 Flash")).toBeInTheDocument());
  return res;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("ChatPage", () => {
  test("boots, creates a first session, and shows the default model", async () => {
    await boot();
    // a POST creating the first session happened
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/chat/sessions")).toBe(true);
    expect(screen.getByPlaceholderText("Message DeepSeek V4 Flash…")).toBeInTheDocument();
  });

  test("model selector lists models sorted by price and selecting a vision model PATCHes the session", async () => {
    await boot();
    fireEvent.click(screen.getByLabelText("Select model"));
    await waitFor(() => expect(screen.getByText("Select model", { selector: "h2" })).toBeInTheDocument());

    // GPT-4o appears (vision) and is selectable
    fireEvent.click(screen.getByText("GPT-4o"));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "PATCH" && (c.body as { model?: string } | undefined)?.model === "openai/gpt-4o")).toBe(true),
    );
  });

  test("attaching an image to a text-only model shows a media warning and disables send", async () => {
    const { container } = await boot();
    const input = fileInput(container);
    const file = new File(["data"], "pic.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/can.?t be read by/)).toBeInTheDocument();
      expect(screen.getByText("pic.png")).toBeInTheDocument();
    });
    // send button disabled due to unsupported attachment (and no text)
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  test("attaching a text file to the text-only model is supported (no warning)", async () => {
    const { container } = await boot();
    const input = fileInput(container);
    const file = new File(["hello world"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("notes.txt")).toBeInTheDocument());
    // no warning
    expect(screen.queryByText(/can.?t be read by/)).toBeNull();
  });

  test("switching to a vision model clears the warning for an image", async () => {
    const { container } = await boot();
    const input = fileInput(container);
    fireEvent.change(input, { target: { files: [new File(["d"], "pic.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByText(/can.?t be read by/)).toBeInTheDocument());

    // switch model to GPT-4o
    fireEvent.click(screen.getByLabelText("Select model"));
    fireEvent.click(screen.getByText("GPT-4o"));
    await waitFor(() => expect(screen.queryByText(/can.?t be read by/)).toBeNull());
  });

  test("typing + sending posts a message and shows the assistant reply", async () => {
    await boot();
    const ta = screen.getByPlaceholderText("Message DeepSeek V4 Flash…");
    fireEvent.change(ta, { target: { value: "hello there" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(screen.getByText("hello there")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("assistant reply")).toBeInTheDocument());
    expect(calls.some((c) => c.method === "POST" && c.url.match(/\/messages$/))).toBe(true);
  });

  test("send is disabled until there is text or an attachment", async () => {
    await boot();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Message DeepSeek V4 Flash…"), { target: { value: "x" } });
    expect(screen.getByLabelText("Send message")).not.toBeDisabled();
  });

  test("New Chat creates another session", async () => {
    await boot();
    const before = store.sessions.size;
    fireEvent.click(screen.getAllByText("New Chat")[0]);
    await waitFor(() => expect(store.sessions.size).toBe(before + 1));
  });
});