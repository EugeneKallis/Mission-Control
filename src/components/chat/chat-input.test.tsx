/**
 * Unit tests for src/components/chat/chat-input.tsx
 *
 * Covers:
 *  - Renders textarea and send button
 *  - Typing updates the input value
 *  - Enter sends the message
 *  - Shift+Enter inserts newline
 *  - Send button disabled when input is empty
 *  - Send button disabled when `disabled` prop is true
 *  - After sending, input is cleared
 *  - aria-label on send button
 */

import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@/test-utils/render";
import { ChatInput } from "./chat-input";

describe("ChatInput", () => {
  test("renders textarea and send button", () => {
    render(<ChatInput onSend={() => {}} />);
    expect(screen.getByLabelText("Chat message")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send message" }),
    ).toBeInTheDocument();
  });

  test("send button is disabled when input is empty", () => {
    render(<ChatInput onSend={() => {}} />);
    const btn = screen.getByRole("button", { name: "Send message" });
    expect(btn).toBeDisabled();
  });

  test("send button is enabled when input has text", () => {
    render(<ChatInput onSend={() => {}} />);
    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    const btn = screen.getByRole("button", { name: "Send message" });
    expect(btn).not.toBeDisabled();
  });

  test("Enter sends the message", () => {
    const onSend = mock();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  test("Shift+Enter does not send the message", () => {
    const onSend = mock();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  test("clears input after sending", () => {
    const onSend = mock();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Chat message") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(textarea.value).toBe("");
  });

  test("send button is disabled when disabled prop is true", () => {
    render(<ChatInput onSend={() => {}} disabled={true} />);
    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    const btn = screen.getByRole("button", { name: "Send message" });
    expect(btn).toBeDisabled();
    expect(textarea).toBeDisabled();
  });

  test("does not send when disabled and Enter is pressed", () => {
    const onSend = mock();
    render(<ChatInput onSend={onSend} disabled={true} />);
    const textarea = screen.getByLabelText("Chat message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  test("placeholder text is shown", () => {
    render(<ChatInput onSend={() => {}} />);
    const textarea = screen.getByLabelText("Chat message");
    expect(textarea).toHaveAttribute("placeholder", expect.stringContaining("Type a message"));
  });
});
