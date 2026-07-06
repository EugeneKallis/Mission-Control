"use client";

import { useCallback, useState } from "react";
import type { ChatMessage } from "@/types";
import { ChatMessageList } from "./chat-message-list";
import { ChatInput } from "./chat-input";

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (loading) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMessage],
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        const assistantMessage: ChatMessage = {
          id: data.id ?? crypto.randomUUID(),
          role: "assistant",
          content: data.content ?? "No response",
          timestamp: data.timestamp ?? Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send message";
        setError(msg);
        // Remove the user message on failure so they can retry
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Header bar */}
      <div
        className="flex items-center justify-between shrink-0 h-14 px-4 md:px-6"
        style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
      >
        <h1 className="text-lg font-bold text-on-surface font-display">Chat</h1>
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Chat
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-4 py-2 flex items-center gap-2 text-xs text-error" style={{ background: "rgba(255, 180, 171, 0.1)" }}>
          <span className="material-symbols-outlined text-sm">error</span>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-on-surface-variant hover:text-on-surface"
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Messages area */}
      <ChatMessageList messages={messages} />

      {/* Input area */}
      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  );
}
