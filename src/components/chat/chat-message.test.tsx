/**
 * Unit tests for src/components/chat/chat-message.tsx
 *
 * Covers:
 *  - User message rendering (right-aligned, bg-primary/10)
 *  - Assistant message rendering (left-aligned, bg-surface-container-high)
 *  - System message rendering (centered, italic, muted)
 *  - Timestamp display
 *  - Role label on hover
 */

import { describe, test, expect } from "bun:test";
import { render, screen } from "@/test-utils/render";
import { ChatMessage } from "./chat-message";

describe("ChatMessage", () => {
  const baseUser = {
    id: "msg-1",
    role: "user" as const,
    content: "Hello, how are you?",
    timestamp: 1710000000000,
  };

  const baseAssistant = {
    id: "msg-2",
    role: "assistant" as const,
    content: "I'm doing great!",
    timestamp: 1710000060000,
  };

  const baseSystem = {
    id: "msg-3",
    role: "system" as const,
    content: "Conversation started",
    timestamp: 1710000000000,
  };

  test("renders user message right-aligned with bg-primary/10", () => {
    const { container } = render(<ChatMessage message={baseUser} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain("justify-end");

    const bubble = outer.firstChild as HTMLElement;
    expect(bubble.className).toContain("bg-primary/10");
    expect(bubble.textContent).toContain("Hello, how are you?");
  });

  test("renders assistant message left-aligned with bg-surface-container-high", () => {
    const { container } = render(<ChatMessage message={baseAssistant} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain("justify-start");

    const bubble = outer.firstChild as HTMLElement;
    expect(bubble.className).toContain("bg-surface-container-high");
    expect(bubble.textContent).toContain("I'm doing great!");
  });

  test("renders system message centered and italic", () => {
    const { container } = render(<ChatMessage message={baseSystem} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain("justify-center");
    expect(outer.textContent).toContain("Conversation started");
    // The italic class should be on the text span inside
    const italicSpan = outer.querySelector(".italic");
    expect(italicSpan).toBeTruthy();
    expect(italicSpan?.textContent).toContain("Conversation started");
  });

  test("displays formatted timestamp", () => {
    render(<ChatMessage message={baseUser} />);
    const timeText = new Date(baseUser.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(screen.getByText(timeText)).toBeInTheDocument();
  });

  test("role label renders with 'You' for user", () => {
    const { container } = render(<ChatMessage message={baseUser} />);
    expect(container.textContent).toContain("You");
  });

  test("role label renders with 'Assistant' for assistant", () => {
    const { container } = render(<ChatMessage message={baseAssistant} />);
    expect(container.textContent).toContain("Assistant");
  });

  test("handles empty content gracefully", () => {
    const emptyMsg = { ...baseUser, content: "" };
    const { container } = render(<ChatMessage message={emptyMsg} />);
    expect(container.textContent).toBeDefined();
  });
});
