/**
 * Unit tests for src/components/chat/chat-page.tsx
 *
 * Covers:
 *  - Renders header with "Chat" title
 *  - Renders "New Chat" button
 *  - Shows empty state initially
 *  - New Chat button resets messages
 *  - Sending a message adds user bubble and fetches POST /api/chat
 *  - Error handling on fetch failure
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  type Mock,
} from "bun:test";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { ChatPage } from "./chat-page";

const originalFetch = globalThis.fetch;
let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  fetchMock = mock(async () =>
    new Response(
      JSON.stringify({
        role: "assistant",
        content: "Mock response. AI coming soon.",
        id: "resp-1",
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    ),
  ) as unknown as Mock<typeof fetch>;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ChatPage", () => {
  test("renders header with Chat title", () => {
    render(<ChatPage />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  test("shows the New Chat button", () => {
    render(<ChatPage />);
    expect(
      screen.getByRole("button", { name: /new chat/i }),
    ).toBeInTheDocument();
  });

  test("shows empty state initially", () => {
    render(<ChatPage />);
    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
  });

  test("sending a message adds user bubble and calls POST /api/chat", async () => {
    render(<ChatPage />);

    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });

    const sendBtn = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(sendBtn);

    // User message should appear immediately (optimistic)
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    // Fetch should have been called
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit?];
    expect(url).toBe("/api/chat");
    expect(init?.method).toBe("POST");

    // Assistant response should appear
    await waitFor(() => {
      expect(
        screen.getByText("Mock response. AI coming soon."),
      ).toBeInTheDocument();
    });
  });

  test("New Chat button resets messages", async () => {
    render(<ChatPage />);

    // Send a message first
    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    const sendBtn = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(sendBtn);

    // Wait for response
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    // Click New Chat
    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));

    // Should be back to empty state
    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
    expect(screen.queryByText("Hello")).toBeNull();
  });

  test("shows error banner on fetch failure and removes user message", async () => {
    fetchMock = mock(async () => new Response("Server error", { status: 500 })) as unknown as Mock<typeof fetch>;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<ChatPage />);

    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument();
    });

    // User message should be removed on failure
    expect(screen.queryByText("Hello")).toBeNull();
  });

  test("error banner can be dismissed", async () => {
    fetchMock = mock(async () => new Response("Server error", { status: 500 })) as unknown as Mock<typeof fetch>;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<ChatPage />);

    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument();
    });

    // Dismiss error
    fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));

    expect(screen.queryByText(/HTTP 500/i)).toBeNull();
  });
});
