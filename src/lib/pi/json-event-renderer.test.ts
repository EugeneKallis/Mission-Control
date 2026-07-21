/**
 * Tests for src/lib/pi/json-event-renderer.ts
 *
 * Covers every event type that the renderer handles, plus
 * truncation, null returns, and edge cases.
 */

import { describe, test, expect } from "bun:test";
import { renderJsonEvent } from "./json-event-renderer";

// ── Agent lifecycle ───────────────────────────────────────────────────────

describe("agent_start", () => {
  test("renders start message", () => {
    const result = renderJsonEvent({ type: "agent_start" });
    expect(result).toBe("[agent_start] Agent session started");
  });
});

describe("agent_end", () => {
  test("renders with message count", () => {
    const result = renderJsonEvent({
      type: "agent_end",
      messages: [{}, {}, {}],
    });
    expect(result).toBe("[agent_end] Session complete (3 messages)");
  });

  test("renders without messages", () => {
    const result = renderJsonEvent({ type: "agent_end" });
    expect(result).toBe("[agent_end] Session complete");
  });

  test("renders with empty messages array", () => {
    const result = renderJsonEvent({ type: "agent_end", messages: [] });
    expect(result).toBe("[agent_end] Session complete (0 messages)");
  });
});

// ── Turn lifecycle ────────────────────────────────────────────────────────

describe("turn_start", () => {
  test("renders turn start", () => {
    const result = renderJsonEvent({ type: "turn_start" });
    expect(result).toBe("[turn_start]");
  });
});

describe("turn_end", () => {
  test("renders with tool result count", () => {
    const result = renderJsonEvent({
      type: "turn_end",
      toolResults: [{}],
    });
    expect(result).toBe("[turn_end] Turn complete (1 tool result)");
  });

  test("renders with plural", () => {
    const result = renderJsonEvent({
      type: "turn_end",
      toolResults: [{}, {}],
    });
    expect(result).toBe("[turn_end] Turn complete (2 tool results)");
  });

  test("renders with zero tool results", () => {
    const result = renderJsonEvent({ type: "turn_end" });
    expect(result).toBe("[turn_end] Turn complete (0 tool results)");
  });
});

// ── Message lifecycle ─────────────────────────────────────────────────────

describe("message_update", () => {
  test("returns null (skipped)", () => {
    const result = renderJsonEvent({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Hello" },
    });
    expect(result).toBeNull();
  });
});

describe("message_end", () => {
  test("renders assistant message text", () => {
    const result = renderJsonEvent({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Here is the file listing." },
          { type: "text", text: "\n\nThere are 3 files." },
        ],
      },
    });
    expect(result).toContain("[assistant]");
    expect(result).toContain("Here is the file listing.");
    expect(result).toContain("There are 3 files.");
  });

  test("returns null for user messages", () => {
    const result = renderJsonEvent({
      type: "message_end",
      message: {
        role: "user",
        content: [{ type: "text", text: "list files" }],
      },
    });
    expect(result).toBeNull();
  });

  test("returns null when message is missing", () => {
    const result = renderJsonEvent({ type: "message_end" });
    expect(result).toBeNull();
  });

  test("returns null when content is missing", () => {
    const result = renderJsonEvent({
      type: "message_end",
      message: { role: "assistant" },
    });
    expect(result).toBeNull();
  });
});

// ── Tool execution ────────────────────────────────────────────────────────

describe("tool_execution_start", () => {
  test("renders tool name and args", () => {
    const result = renderJsonEvent({
      type: "tool_execution_start",
      toolName: "read",
      args: { path: "/tmp/test.txt" },
    });
    expect(result).toContain("[tool_start: read]");
    expect(result).toContain('"path"');
    expect(result).toContain("/tmp/test.txt");
  });

  test("handles missing toolName", () => {
    const result = renderJsonEvent({
      type: "tool_execution_start",
      args: { path: "x" },
    });
    expect(result).toContain("[tool_start: ?]");
  });

  test("truncates long args at 200 chars", () => {
    const longStr = "a".repeat(300);
    const result = renderJsonEvent({
      type: "tool_execution_start",
      toolName: "write",
      args: { path: "/tmp/test.txt", content: longStr },
    });
    expect(result!.length).toBeLessThan(250);
  });
});

describe("tool_execution_end", () => {
  test("renders success with content text", () => {
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolName: "grep",
      result: {
        content: [{ type: "text", text: "Found 3 matches." }],
      },
      isError: false,
    });
    expect(result).toContain("[tool_end: grep] OK");
    expect(result).toContain("Found 3 matches.");
  });

  test("renders error with ERROR prefix", () => {
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolName: "bash",
      result: {
        content: [{ type: "text", text: "Command not found" }],
      },
      isError: true,
    });
    expect(result).toContain("[tool_end: bash] ERROR");
    expect(result).toContain("Command not found");
  });

  test("handles missing result content", () => {
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolName: "ls",
      result: {},
      isError: false,
    });
    expect(result).toContain("(no content)");
  });

  test("handles missing toolName and isError", () => {
    const result = renderJsonEvent({
      type: "tool_execution_end",
      isError: true,
    });
    expect(result).toContain("[tool_end: ?] ERROR");
  });

  test("truncates long result text", () => {
    const longText = "x".repeat(1000);
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolName: "read",
      result: {
        content: [{ type: "text", text: longText }],
      },
      isError: false,
    });
    expect(result).toContain("[truncated]");
    expect(result!.length).toBeLessThan(600); // truncation ensures shorter
  });
});

// ── Compaction ────────────────────────────────────────────────────────────

describe("compaction_start", () => {
  test("renders with reason", () => {
    const result = renderJsonEvent({
      type: "compaction_start",
      reason: "threshold",
    });
    expect(result).toBe("[compaction_start] reason: threshold");
  });

  test("renders with missing reason", () => {
    const result = renderJsonEvent({ type: "compaction_start" });
    expect(result).toBe("[compaction_start] reason: ?");
  });
});

describe("compaction_end", () => {
  test("renders completed compaction", () => {
    const result = renderJsonEvent({
      type: "compaction_end",
      reason: "overflow",
      aborted: false,
    });
    expect(result).toBe("[compaction_end] reason: overflow — ok");
  });

  test("renders aborted compaction", () => {
    const result = renderJsonEvent({
      type: "compaction_end",
      reason: "manual",
      aborted: true,
    });
    expect(result).toBe("[compaction_end] reason: manual — aborted");
  });
});

// ── Auto-retry ────────────────────────────────────────────────────────────

describe("auto_retry_start", () => {
  test("renders with attempt, max, and error", () => {
    const result = renderJsonEvent({
      type: "auto_retry_start",
      attempt: 2,
      maxAttempts: 3,
      errorMessage: "Rate limit exceeded",
    });
    expect(result).toContain("[retry_start] attempt 2/3");
    expect(result).toContain("Rate limit exceeded");
  });

  test("handles missing fields", () => {
    const result = renderJsonEvent({ type: "auto_retry_start" });
    expect(result).toContain("[retry_start]");
    expect(result).toContain("?");
  });

  test("truncates long error message", () => {
    const longErr = "x".repeat(300);
    const result = renderJsonEvent({
      type: "auto_retry_start",
      attempt: 1,
      maxAttempts: 3,
      errorMessage: longErr,
    });
    expect(result!.length).toBeLessThan(250);
  });
});

describe("auto_retry_end", () => {
  test("renders succeeded retry", () => {
    const result = renderJsonEvent({
      type: "auto_retry_end",
      success: true,
      attempt: 2,
    });
    expect(result).toContain("[retry_end] attempt 2 succeeded");
  });

  test("renders failed retry with final error", () => {
    const result = renderJsonEvent({
      type: "auto_retry_end",
      success: false,
      attempt: 3,
      finalError: "All retries exhausted",
    });
    expect(result).toContain("[retry_end] attempt 3 failed");
    expect(result).toContain("All retries exhausted");
  });

  test("truncates long final error", () => {
    const longErr = "y".repeat(300);
    const result = renderJsonEvent({
      type: "auto_retry_end",
      success: false,
      attempt: 1,
      finalError: longErr,
    });
    expect(result!.length).toBeLessThan(250);
  });
});

// ── Events that should be skipped ─────────────────────────────────────────

describe("events that return null", () => {
  const skipCases = [
    { type: "connected", sessionId: "abc", cwd: "/tmp", timestamp: 1 },
    { type: "session", version: 3, id: "uuid" },
    { type: "extension_ui_request", id: "req1", method: "confirm" },
    { type: "extension_error", extensionPath: "/x", event: "y", error: "z" },
    { type: "queue_update", steering: [] },
    { type: "unknown_event_type" },
    { type: "turn_something" },
    {},
  ];

  for (const evt of skipCases) {
    test(`${evt.type ?? "empty"} returns null`, () => {
      expect(renderJsonEvent(evt as any)).toBeNull();
    });
  }
});
