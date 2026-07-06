"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type { ChatMessage, Conversation } from "./chat-types";

/* ── Mock data ───────────────────────────────────────────────────────────── */

const sampleMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "What's the current server status?",
    timestamp: Date.now() - 120_000,
  },
  {
    id: "msg-2",
    role: "assistant",
    content:
      "All systems are running normally. CPU usage is at 23%, memory at 1.8/8 GB, and all agents are connected. The last scrape completed successfully 3 minutes ago.",
    timestamp: Date.now() - 110_000,
  },
  {
    id: "msg-3",
    role: "user",
    content: "Can you run the nightly maintenance script?",
    timestamp: Date.now() - 100_000,
  },
  {
    id: "msg-4",
    role: "assistant",
    content:
      "I've started the nightly maintenance script on the primary server. You can watch the progress on the home page terminal. Estimated completion time is about 45 seconds.",
    timestamp: Date.now() - 90_000,
  },
];

const initialConversations: Conversation[] = [
  {
    id: "conv-1",
    title: "Server status check",
    messages: sampleMessages,
    createdAt: Date.now() - 120_000,
    updatedAt: Date.now() - 90_000,
  },
  {
    id: "conv-2",
    title: "Scraper configuration",
    messages: [
      {
        id: "msg-5",
        role: "user",
        content: "How do I configure the 141jav scraper?",
        timestamp: Date.now() - 3600_000,
      },
      {
        id: "msg-6",
        role: "assistant",
        content:
          "The 141jav scraper is configured in your config page. You can set the number of pages to scrape, enable/disable magnet collection, and configure the output format. Check the docs for detailed options.",
        timestamp: Date.now() - 3500_000,
      },
    ],
    createdAt: Date.now() - 3600_000,
    updatedAt: Date.now() - 3500_000,
  },
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

let nextConvId = 3;
let nextMsgId = 7;

function createConvId(): string {
  return `conv-${nextConvId++}`;
}

function createMsgId(): string {
  return `msg-${nextMsgId++}`;
}

function truncateTitle(content: string): string {
  return content.length > 40 ? content.slice(0, 40) + "…" : content;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function ChatEmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-3 p-8">
      <span className="material-symbols-outlined text-5xl opacity-40">
        {icon}
      </span>
      <p className="text-lg font-display font-semibold text-on-surface/60">
        {title}
      </p>
      <p className="text-sm max-w-md text-center">{description}</p>
    </div>
  );
}

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-none flex items-center justify-center shrink-0 ${
          isUser
            ? "bg-primary/20 text-primary"
            : "bg-surface-container-high text-on-surface-variant"
        }`}
      >
        <span className="material-symbols-outlined text-sm">
          {isUser ? "person" : "smart_toy"}
        </span>
      </div>

      {/* Bubble */}
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <span className="text-[11px] text-on-surface-variant/60 font-medium">
          {isUser ? "You" : "Assistant"}
        </span>
        <div
          className={`px-3 py-2 text-sm leading-relaxed ${
            isUser
              ? "bg-primary/15 text-on-surface"
              : "bg-surface-container-high text-on-surface"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  variant,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  variant: "desktop" | "mobile";
  onClose?: () => void;
}) {
  const inner = (
    <div className="flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-3 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold transition-colors border border-primary/20 text-primary hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-on-surface-variant/50">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1 cursor-pointer transition-colors ${
                  conv.id === activeId
                    ? "bg-surface-container-high"
                    : "hover:bg-surface-container-high/60"
                }`}
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className="flex-1 text-left px-3 py-2 min-w-0"
                >
                  <div className="text-xs font-medium text-on-surface truncate">
                    {conv.title}
                  </div>
                  <div className="text-[10px] text-on-surface-variant/50 mt-0.5">
                    {formatTime(conv.updatedAt)}
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="p-1.5 mr-1 opacity-0 group-hover:opacity-100 hover:bg-error/10 text-on-surface-variant hover:text-error transition-all"
                  aria-label={`Delete ${conv.title}`}
                >
                  <span className="material-symbols-outlined text-sm">
                    delete
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (variant === "desktop") {
    return (
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-outline-variant/30 bg-surface">
        {inner}
      </aside>
    );
  }

  return (
    <>
      {/* Backdrop */}
      {onClose && (
        <div
          className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-[280px] bg-surface shadow-2xl z-50 md:hidden flex flex-col">
        {inner}
      </div>
    </>
  );
}

/* ── Main page component ──────────────────────────────────────────────────── */

export function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>("conv-1");
  const [inputText, setInputText] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  function handleNewChat() {
    const id = createConvId();
    const conv: Conversation = {
      id,
      title: "New conversation",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(id);
    setMobileSidebarOpen(false);
  }

  function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    setMobileSidebarOpen(false);
  }

  function handleDeleteConversation(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeConversationId === id) {
        setActiveConversationId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }

  function handleSendMessage() {
    const text = inputText.trim();
    if (!text || !activeConversationId) return;

    const userMsg: ChatMessage = {
      id: createMsgId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: createMsgId(),
      role: "assistant",
      content: `This is a placeholder response. In the future, this is where the AI assistant will answer your query about "${truncateTitle(text)}".`,
      timestamp: Date.now() + 100,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConversationId) return c;
        const newTitle =
          c.title === "New conversation" ? truncateTitle(text) : c.title;
        return {
          ...c,
          title: newTitle,
          messages: [...c.messages, userMsg, assistantMsg],
          updatedAt: Date.now(),
        };
      }),
    );

    setInputText("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  return (
    <div className="flex h-full relative">
      {/* Desktop sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        variant="desktop"
      />

      {/* Mobile sidebar */}
      {mobileSidebarOpen && (
        <ChatSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
          variant="mobile"
          onClose={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile sidebar toggle */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-outline-variant/30 shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1 text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label="Open conversation list"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <span className="text-xs font-medium text-on-surface-variant truncate">
            {activeConversation?.title ?? "Chat"}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!activeConversation ? (
            <ChatEmptyState
              icon="chat"
              title="No conversation selected"
              description="Select a conversation from the sidebar or start a new one."
            />
          ) : activeConversation.messages.length === 0 ? (
            <ChatEmptyState
              icon="chat"
              title="Start a conversation"
              description="Type a message below to begin chatting with the assistant."
            />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {activeConversation.messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-outline-variant/30 bg-bg">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-end gap-2 bg-surface-container-high p-2">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/40 resize-none outline-none min-h-[36px] max-h-[160px] py-1.5 px-2"
                aria-label="Message input"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || !activeConversationId}
                className="shrink-0 p-2 rounded-none transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-primary/20 text-primary hover:bg-primary/30"
                aria-label="Send message"
              >
                <span className="material-symbols-outlined text-lg">
                  send
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
