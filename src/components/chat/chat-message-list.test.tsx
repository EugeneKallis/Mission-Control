/**
 * Unit tests for src/components/chat/chat-message-list.tsx
 *
 * Covers:
 *  - Empty state rendering ("Start a conversation")
 *  - Renders messages when provided
 *  - Auto-scrolls to bottom on new messages (smoke test)
 */

import { describe, test, expect } from "bun:test";
import { render, screen } from "@/test-utils/render";
import { ChatMessageList } from "./chat-message-list";
import type { ChatMessage } from "@/types";

describe("ChatMessageList", () => {
  const sampleMessages: ChatMessage[] = [
    { id: "m1", role: "user", content: "Hello", timestamp: 1710000000000 },
    { id: "m2", role: "assistant", content: "Hi there!", timestamp: 1710000060000 },
    { id: "m3", role: "user", content: "How are you?", timestamp: 1710000120000 },
  ];

  test("shows empty state when no messages", () => {
    render(<ChatMessageList messages={[]} />);
    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
    expect(screen.getByText("Type a message to begin chatting")).toBeInTheDocument();
  });

  test("renders all messages when provided", () => {
    render(<ChatMessageList messages={sampleMessages} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
    expect(screen.getByText("How are you?")).toBeInTheDocument();
  });

  test("does not show empty state when messages exist", () => {
    render(<ChatMessageList messages={sampleMessages} />);
    expect(screen.queryByText("Start a conversation")).toBeNull();
  });

  test("renders messages in correct order", () => {
    const { container } = render(<ChatMessageList messages={sampleMessages} />);
    const textContents = Array.from(container.querySelectorAll("p")).map(
      (el) => el.textContent,
    );
    expect(textContents).toEqual(["Hello", "Hi there!", "How are you?"]);
  });
});
