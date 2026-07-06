"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/types";
import { ChatMessage as ChatMessageBubble } from "./chat-message";

interface ChatMessageListProps {
  messages: ChatMessage[];
}

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant/50 select-none">
          <span className="material-symbols-outlined text-5xl">chat</span>
          <p className="text-sm font-medium">Start a conversation</p>
          <p className="text-xs">Type a message to begin chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 py-4 space-y-1">
      {messages.map((msg) => (
        <ChatMessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
