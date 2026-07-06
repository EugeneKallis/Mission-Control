"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Auto-resize: reset height first, then set to scrollHeight
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="shrink-0 px-4 py-3" style={{ borderTop: "1px solid rgba(59, 75, 63, 0.3)" }}>
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <label htmlFor="chat-input" className="sr-only">
          Chat message
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            // Wait for state update then resize
            requestAnimationFrame(handleInput);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-surface-container-high text-on-surface placeholder:text-on-surface-variant/40 rounded-lg px-4 py-2.5 text-sm outline-none border border-outline-variant/30 focus:border-primary/50 transition-colors disabled:opacity-50"
          style={{ maxHeight: "200px" }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-on-primary disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_12px_2px_rgba(0,255,156,0.2)] transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-xl">send</span>
        </button>
      </div>
    </div>
  );
}
