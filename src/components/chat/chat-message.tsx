"use client";

import type { ChatMessage as ChatMessageType } from "@/types";

interface ChatMessageProps {
  message: ChatMessageType;
}

const roles: Record<string, string> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="flex items-center gap-2 max-w-[80%]">
          <div className="h-px flex-1" style={{ background: "rgba(59, 75, 63, 0.3)" }} />
          <span className="text-[11px] text-on-surface-variant/50 italic whitespace-nowrap">
            {message.content}
          </span>
          <div className="h-px flex-1" style={{ background: "rgba(59, 75, 63, 0.3)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-4 py-1.5`}>
      <div
        className={`
          group relative max-w-[75%] min-w-0 rounded-lg px-4 py-2.5
          ${isUser ? "bg-primary/10" : "bg-surface-container-high"}
        `}
      >
        {/* Role label (visible on hover) */}
        <div
          className={`
            absolute -top-4 text-[10px] text-on-surface-variant/40
            opacity-0 group-hover:opacity-100 transition-opacity
            ${isUser ? "right-0" : "left-0"}
          `}
        >
          {roles[message.role] ?? message.role}
        </div>

        {/* Content */}
        <p className="text-sm text-on-surface whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {/* Timestamp */}
        <div
          className={`flex mt-1 gap-1 ${isUser ? "justify-end" : "justify-start"}`}
        >
          <span className="text-[10px] text-on-surface-variant/40">
            {time}
          </span>
        </div>
      </div>
    </div>
  );
}
