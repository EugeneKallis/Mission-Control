/**
 * Unit tests for src/components/chat/chat-page.tsx
 *
 * Covers:
 *  - Renders the input area (textarea + send button)
 *  - Renders sample messages from the default conversation
 *  - Shows the conversation list sidebar
 *  - New Chat button creates a new conversation
 *  - Selecting a conversation changes the active chat
 *  - Typing in the textarea updates input text
 *  - Desktop sidebar renders <aside> with hidden/md:flex classes
 *  - Mobile sidebar backdrop renders only after hamburger click
 *  - Empty state renders for a new empty conversation
 *  - Delete conversation removes it from the list
 *  - Send button disabled/enabled based on input
 *  - Sending a message adds user + assistant messages
 */
import { describe, test, expect } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";

const { ChatPage } = await import("./chat-page");

describe("ChatPage", () => {
  test("renders the input area with textarea and send button", () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText("Type a message…")).toBeInTheDocument();
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  test("renders sample messages from the default conversation", () => {
    render(<ChatPage />);
    expect(
      screen.getByText("What's the current server status?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All systems are running normally/),
    ).toBeInTheDocument();
  });

  test("shows the conversation list sidebar with conversation titles", () => {
    render(<ChatPage />);
    // Title appears in sidebar + mobile header bar; use getAllByText
    const firstTitle = screen.getAllByText("Server status check");
    expect(firstTitle.length).toBe(2);
    expect(firstTitle[0]).toBeInTheDocument();
    expect(screen.getByText("Scraper configuration")).toBeInTheDocument();
  });

  test("New Chat button creates a new conversation", () => {
    render(<ChatPage />);
    const newChatButtons = screen.getAllByText("New Chat");
    fireEvent.click(newChatButtons[0]);

    // Title appears in sidebar + mobile header bar
    const convTitle = screen.getAllByText("New conversation");
    expect(convTitle.length).toBe(2);
    // The new conversation should be the first sidebar item
    expect(convTitle[0]).toBeInTheDocument();
  });

  test("selecting a conversation changes the active chat", () => {
    render(<ChatPage />);
    fireEvent.click(screen.getByText("Scraper configuration"));

    expect(
      screen.getByText("How do I configure the 141jav scraper?"),
    ).toBeInTheDocument();
  });

  test("typing in the textarea updates input text", () => {
    render(<ChatPage />);
    const textarea = screen.getByPlaceholderText(
      "Type a message…",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    expect(textarea.value).toBe("Hello world");
  });

  test("desktop sidebar renders an <aside> element with desktop classes", () => {
    const { container } = render(<ChatPage />);
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside?.className).toContain("hidden");
    expect(aside?.className).toContain("md:flex");
  });

  test("mobile sidebar backdrop does not render by default", () => {
    const { container } = render(<ChatPage />);
    // No backdrop divs should be present initially — the mobile drawer
    // is only opened when the hamburger button is clicked.
    const backdrops = Array.from(container.querySelectorAll("*")).filter(
      (el) =>
        el.classList.contains("fixed") &&
        el.classList.contains("inset-0") &&
        el.classList.contains("bg-black/70"),
    );
    expect(backdrops.length).toBe(0);
  });

  test("mobile sidebar opens on hamburger click", () => {
    render(<ChatPage />);
    const menuButton = screen.getByLabelText("Open conversation list");
    fireEvent.click(menuButton);

    // After clicking, a backdrop element should exist in the DOM
    const backdrops = Array.from(document.querySelectorAll(".fixed.inset-0"));
    expect(backdrops.length).toBeGreaterThan(0);
  });

  test("delete conversation removes it from the list", () => {
    render(<ChatPage />);
    const deleteButtons = screen.getAllByLabelText(/Delete/);
    expect(deleteButtons.length).toBe(2);

    // Delete the first conversation
    fireEvent.click(deleteButtons[0]);

    // Only one conversation should remain
    const remaining = screen.getAllByLabelText(/Delete/);
    expect(remaining.length).toBe(1);
  });

  test("send button is disabled when textarea is empty", () => {
    render(<ChatPage />);
    const sendButton = screen.getByLabelText("Send message");
    expect(sendButton).toBeDisabled();
  });

  test("send button is enabled when textarea has text", () => {
    render(<ChatPage />);
    const textarea = screen.getByPlaceholderText("Type a message…");
    fireEvent.change(textarea, { target: { value: "Test message" } });
    const sendButton = screen.getByLabelText("Send message");
    expect(sendButton).not.toBeDisabled();
  });

  test("sending a message adds user and assistant messages", () => {
    render(<ChatPage />);
    const textarea = screen.getByPlaceholderText("Type a message…");
    const sendButton = screen.getByLabelText("Send message");

    fireEvent.change(textarea, { target: { value: "Test message" } });
    fireEvent.click(sendButton);

    // User message should appear
    expect(screen.getByText("Test message")).toBeInTheDocument();
    // Assistant placeholder response should appear
    expect(
      screen.getByText(/This is a placeholder response/),
    ).toBeInTheDocument();
  });
});
