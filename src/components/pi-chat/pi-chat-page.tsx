/**
 * Pi Chat Page — full Pi-powered chat interface.
 *
 * Connects to a Pi RPC session via SSE, streams events, and sends
 * user messages via POST. Replaces the old ChatPage entirely.
 *
 * Features: real-time streaming, slash-command autocomplete, visible
 * skills/tools, working directory indicator, thinking blocks, and
 * per-tool rendering (bash→terminal, read→file preview, edit→diff).
 */

"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { usePiStream } from "@/hooks/use-pi-stream";
import { SlashAutocomplete, useSlashAutocomplete, type SlashCommand } from "./slash-autocomplete";
import { SkillsToolsDropdowns } from "./skills-tools-dropdowns";
import { ToolCallCard } from "./tool-call-card";
import { ModelSelector } from "./model-selector";
import { StatusBar } from "./status-bar";
import { SessionSidebar } from "./session-sidebar";
import type { ToolCallDisplay } from "./pi-chat-types";
import type { PiEvent, ThinkingLevel } from "@/lib/pi/event-types";
import { truncate } from "@/lib/format";

// ── Helpers ────────────────────────────────────────────────────────────────



// ── Pi Event → UI helpers ──────────────────────────────────────────────────

/** Extract text delta from a message_update event. */
function getTextDelta(event: PiEvent): string | null {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent?.type === "text_delta"
  ) {
    return event.assistantMessageEvent.delta;
  }
  return null;
}

/** Extract thinking delta from a message_update event. */
function getThinkingDelta(event: PiEvent): string | null {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent?.type === "thinking_delta"
  ) {
    return event.assistantMessageEvent.delta;
  }
  return null;
}

/** Check if event is a tool execution start. */
function isToolExecStart(event: PiEvent) {
  return event.type === "tool_execution_start";
}

/** Check if event is a tool execution update. */
function isToolExecUpdate(event: PiEvent) {
  return event.type === "tool_execution_update";
}

/** Check if event is a tool execution end. */
function isToolExecEnd(event: PiEvent) {
  return event.type === "tool_execution_end";
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking: string;
  timestamp: number;
  status: "streaming" | "complete" | "error";
  toolCalls: ToolCallDisplay[];
}

// ── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const [thinkingOpen, setThinkingOpen] = useState(false);

  if (isSystem) {
    return (
      <div className="flex justify-center my-2" data-system-message>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-low border border-outline-variant/30 text-on-surface-variant text-xs italic">
          <span className="material-symbols-outlined text-[14px] text-primary">auto_awesome</span>
          <span>{msg.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 flex items-center justify-center shrink-0 ${
          isUser ? "bg-primary/20 text-primary" : "bg-surface-container-high text-on-surface-variant"
        }`}
      >
        <span className="material-symbols-outlined text-sm">
          {isUser ? "person" : "smart_toy"}
        </span>
      </div>

      <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        <span className="text-[11px] text-on-surface-variant/60 font-medium">
          {isUser ? "You" : "Pi"}
        </span>

        {/* Thinking block */}
        {msg.thinking && (
          <div className="w-full">
            <button
              onClick={() => setThinkingOpen(!thinkingOpen)}
              className="flex items-center gap-1.5 text-[11px] text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-sm">
                {thinkingOpen ? "expand_less" : "psychology"}
              </span>
              {thinkingOpen ? "Hide thinking" : `${msg.thinking.length > 60 ? truncate(msg.thinking, 60) + "…" : "Show thinking"}`}
            </button>
            {thinkingOpen && (
              <div className="mt-1 px-3 py-2 bg-surface-container-low text-[12px] text-on-surface-variant/80 leading-relaxed whitespace-pre-wrap font-mono border-l-2 border-primary/30">
                {msg.thinking}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className={`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-primary/15 text-on-surface"
              : "bg-surface-container-high text-on-surface"
          }`}
        >
          {msg.content}
          {msg.status === "streaming" && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-primary/60 animate-pulse" />
          )}
        </div>

        {/* Tool calls */}
        {msg.toolCalls.length > 0 && (
          <div className="w-full space-y-1 mt-1">
            {msg.toolCalls.map((tc) => (
              <ToolCallCard key={tc.toolCallId} tc={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({
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
      <span className="material-symbols-outlined text-5xl opacity-40">{icon}</span>
      <p className="text-lg font-display font-semibold text-on-surface/60">{title}</p>
      <p className="text-sm max-w-md text-center">{description}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function PiChatPage() {
  // ── Session state ──────────────────────────────────────────────────────
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // ── SSE stream ───────────────────────────────────────────────────────
  // (must be declared before runNewSession which uses clearEvents)
  const { events, isConnected, clearEvents } = usePiStream();
  const lastEventsLength = useRef(0);

  // ── Built-in slash command handlers ────────────────────────────────────
  // runNewSession: sends a new_session RPC to Pi, clears local state,
  // and shows a system message so the user sees the session was reset.: sends a new_session RPC to Pi, clears local state,
  // and shows a system message so the user sees the session was reset.
  const runNewSession = useCallback(async () => {
    // Append a system message so the user sees a visible "new session"
    // marker before the network request completes.
    const sysMsg: DisplayMessage = {
      id: `system-new-${Date.now()}`,
      role: "system",
      content: "Starting a new Pi session…",
      thinking: "",
      timestamp: Date.now(),
      status: "complete",
      toolCalls: [],
    };
    setMessages((prev) => [...prev, sysMsg]);
    setError(null);
    setSending(false);
    setInputText("");

    // Tell Pi to start a new session (clears its context).
    try {
      await fetch("/api/pi/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "new_session" }),
      });
    } catch {
      // best effort — the local UI is cleared either way
    }

    // Clear the local event buffer + Pi event history so the next prompt
    // doesn't see stale events from the previous session.
    clearEvents();
    lastEventsLength.current = 0;
    setMessages((prev) => [
      ...prev,
      {
        id: `system-new-done-${Date.now()}`,
        role: "system",
        content: "New session started — context cleared",
        thinking: "",
        timestamp: Date.now(),
        status: "complete",
        toolCalls: [],
      },
    ]);
  }, [clearEvents]);

  // runClearScreen: only wipes the on-screen messages; Pi's context
  // is preserved (useful if the user wants to start a new thread
  // visually but keep the conversation going).
  const runClearScreen = useCallback(() => {
    setMessages([]);
    setError(null);
    setSending(false);
    setInputText("");
  }, []);

  // ── Slash autocomplete ─────────────────────────────────────────────────
  const {
    showAutocomplete,
    handleSelect: handleSlashSelect,
    activeIndex: slashActiveIndex,
    filtered: slashFiltered,
    handleKeyDown: handleSlashKeyDown,
  } = useSlashAutocomplete(inputText, (text) => {
    // Built-in commands arrive as SlashCommand objects
    if (typeof text === "object") {
      if (text.commandId === "new") {
        void runNewSession();
      } else if (text.commandId === "clear") {
        runClearScreen();
      }
      return;
    }
    setInputText(text);
  });

  // ── Process Pi events into messages ────────────────────────────────────
  useEffect(() => {
    if (events.length === lastEventsLength.current) return;

    const newEvents = events.slice(lastEventsLength.current);
    lastEventsLength.current = events.length;

    for (const event of newEvents) {
      // Extract cwd from connected event
      if (event.type === "connected") {
        setCwd(event.cwd);
        continue;
      }

      // Extract text delta
      const textDelta = getTextDelta(event);
      if (textDelta) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.status === "streaming") {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + textDelta,
            };
            return updated;
          }
          // Start a new assistant message
          return [
            ...prev,
            {
              id: `assistant-${event.type}-${Date.now()}`,
              role: "assistant",
              content: textDelta,
              thinking: "",
              timestamp: Date.now(),
              status: "streaming",
              toolCalls: [],
            },
          ];
        });
        continue;
      }

      // Extract thinking delta
      const thinkDelta = getThinkingDelta(event);
      if (thinkDelta) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              thinking: last.thinking + thinkDelta,
            };
            return updated;
          }
          return prev;
        });
        continue;
      }

      // Tool execution start
      if (isToolExecStart(event)) {
        const tcId = event.toolCallId;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              toolCalls: [
                ...last.toolCalls,
                {
                  toolCallId: tcId,
                  toolName: event.toolName,
                  args: JSON.stringify(event.args, null, 2),
                  status: "running" as const,
                  result: "",
                },
              ],
            };
            return updated;
          }
          return prev;
        });
        continue;
      }

      // Tool execution update (streaming output)
      if (isToolExecUpdate(event)) {
        const partialText =
          event.partialResult?.content
            ?.map((c) => ("text" in c ? c.text : ""))
            .join("") ?? "";
        if (!partialText) continue;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role !== "assistant") return prev;
          const toolCalls = last.toolCalls.map((tc) =>
            tc.toolCallId === event.toolCallId
              ? { ...tc, result: tc.result + partialText, status: "running" as const }
              : tc,
          );
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, toolCalls };
          return updated;
        });
        continue;
      }

      // Tool execution end
      if (isToolExecEnd(event)) {
        const resultText =
          event.result?.content
            ?.map((c) => ("text" in c ? c.text : ""))
            .join("") ?? "";
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role !== "assistant") return prev;
          const toolCalls = last.toolCalls.map((tc) =>
            tc.toolCallId === event.toolCallId
              ? {
                  ...tc,
                  result: tc.result || resultText,
                  status: (event.isError ? "error" : "complete") as "complete" | "error",
                }
              : tc,
          );
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, toolCalls };
          return updated;
        });
        continue;
      }

      // Turn end / message_end → mark assistant message as complete
      if (event.type === "turn_end" || event.type === "message_end") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.status === "streaming") {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, status: "complete" };
            return updated;
          }
          return prev;
        });
        continue;
      }

      // Agent end → finalize any remaining streaming messages
      if (event.type === "agent_end" || event.type === "agent_settled") {
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "assistant" && updated[i].status === "streaming") {
              updated[i] = { ...updated[i], status: "complete" };
            } else break;
          }
          return updated;
        });
        setSending(false);
        continue;
      }

      // Agent start → clear sending state
      if (event.type === "agent_start") {
        setSending(true);
        continue;
      }
    }
  }, [events]);

  // ── Auto-scroll ────────────────────────────────────────────────────────
  // Only scroll to bottom when the user is near the bottom (within 100px).
  // Prevents yanking the viewport back to bottom while the user is
  // reading earlier messages during a streaming response.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  // ── Send message ──────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setError(null);
    setInputText("");

    // Add optimistic user message
    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      thinking: "",
      timestamp: Date.now(),
      status: "complete",
      toolCalls: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await fetch("/api/pi/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "prompt", message: text }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      // Response arrives asynchronously via the SSE stream
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send message";
      setError(msg);
      setSending(false);
      // Remove optimistic user message on failure
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    }
  }, [inputText, sending]);

  // ── Abort agent ───────────────────────────────────────────────────────
  const handleAbort = useCallback(async () => {
    try {
      await fetch("/api/pi/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "abort" }),
      });
    } catch {
      // best effort
    }
    setSending(false);
  }, []);

  // ── Model selection ──────────────────────────────────────────────────
  const handleModelSelect = useCallback(
    async (modelId: string, provider: string) => {
      // Optimistically update the UI
      setCurrentModelId(modelId);
      setModelSelectorOpen(false);

      // Send the set_model command to Pi
      try {
        const res = await fetch("/api/pi/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId, provider }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          console.warn("Failed to set model:", data.error);
        }
      } catch (e) {
        console.warn("Failed to set model:", e);
      }
    },
    [],
  );

  // ── Thinking level change ────────────────────────────────────────────
  const handleThinkingLevelChange = useCallback(
    async (level: ThinkingLevel) => {
      setThinkingLevel(level);

      try {
        const res = await fetch("/api/pi/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ thinkingLevel: level }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          console.warn("Failed to set thinking level:", data.error);
        }
      } catch (e) {
        console.warn("Failed to set thinking level:", e);
      }
    },
    [],
  );

  // ── New session ────────────────────────────────────────────────────────
  // Runs the full new-session flow: RPC + clear + system message.
  const handleNewSession = useCallback(() => {
    void runNewSession();
  }, [runNewSession]);

  // ── Session switching (from sidebar) ──────────────────────────────────
  const handleSwitchSession = useCallback(
    async (targetSessionId: string) => {
      try {
        await fetch("/api/pi/command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "switch_session", sessionPath: targetSessionId }),
        });
      } catch {
        // best effort
      }
      setActiveSessionId(targetSessionId);
      setSidebarOpen(false);
      // Clear messages — they'll be reloaded from the new session
      clearEvents();
      lastEventsLength.current = 0;
      setMessages([]);
    },
    [clearEvents],
  );

  // ── New session from sidebar ───────────────────────────────────────────
  const handleNewSessionFromSidebar = useCallback(() => {
    handleNewSession();
    setActiveSessionId(null);
    setSidebarOpen(false);
  }, [handleNewSession]);

  // ── Keyboard handling ──────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash autocomplete takes priority when open
      if (showAutocomplete && handleSlashKeyDown(e)) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage, showAutocomplete, handleSlashKeyDown],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 border-b border-outline-variant/30 shrink-0">
        {/* Left cluster: history toggle, connection status, model info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`shrink-0 p-0.5 transition-colors ${
              sidebarOpen
                ? "text-primary"
                : "text-on-surface-variant/50 hover:text-on-surface-variant"
            }`}
            title="Toggle session list"
          >
            <span className="material-symbols-outlined text-sm">history</span>
          </button>

          <span
            className={`hidden sm:inline-block w-2 h-2 rounded-full shrink-0 ${
              isConnected ? "bg-primary" : "bg-error"
            }`}
            title={isConnected ? "Connected" : "Disconnected"}
          />

          <StatusBar
            isConnected={isConnected}
            onOpenModelSelector={() => setModelSelectorOpen(true)}
            currentModelId={currentModelId}
            thinkingLevel={thinkingLevel}
            onThinkingLevelChange={handleThinkingLevelChange}
          />
        </div>

        {/* Right cluster: skills & tools, new session */}
        <div className="flex items-center gap-2 shrink-0">
          <SkillsToolsDropdowns />

          {/* New session button */}
          <button
            onClick={handleNewSession}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high transition-colors"
            title="New session"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </div>

      {/* Model selector modal */}
      <ModelSelector
        open={modelSelectorOpen}
        onClose={() => setModelSelectorOpen(false)}
        
        activeModelId={currentModelId}
        onSelect={handleModelSelect}
      />

      {/* Session sidebar + Messages area */}
      <div className="flex flex-1 min-h-0">
        {/* Session sidebar */}
        <SessionSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeSessionId={activeSessionId}
          onSwitchSession={handleSwitchSession}
          onNewSession={handleNewSessionFromSidebar}
        />

      {/* Messages area */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 px-3 py-2 bg-error/10 text-error text-xs border border-error/30">
            {error}
          </div>
        )}

        {messages.length === 0 && !sending ? (
          <EmptyState
            icon="chat"
            title="Pi Agent"
            description={`Type a message below to start a session with Pi. Skills and tools are configurable in Pi Settings.${isConnected ? "" : " Connecting…"}`}
          />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {/* Streaming indicator */}
            {sending && messages[messages.length - 1]?.status !== "streaming" && (
              <div className="flex gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-surface-container-high text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                </div>
                <span className="text-xs text-on-surface-variant/60 self-center">Thinking…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-outline-variant/30 bg-bg">
        <div className="px-4 py-3">
          {cwd && (
            <div
              className="max-w-3xl mx-auto mb-1.5 px-2 py-0.5 border border-outline-variant/30 bg-surface-container-low text-[11px] font-mono text-on-surface-variant/50"
              title={cwd}
            >
              <span className="whitespace-nowrap">{cwd}</span>
            </div>
          )}
          <div className="max-w-3xl mx-auto flex items-end gap-2 bg-surface-container-high p-2 relative">
            {/* Slash autocomplete dropdown */}
            <SlashAutocomplete
              value={inputText}
              open={showAutocomplete}
              onSelect={handleSlashSelect}
              activeIndex={slashActiveIndex}
              filtered={slashFiltered}
            />

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Pi…  (/ for skills)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/40 resize-none outline-none min-h-[36px] max-h-[160px] py-1.5 px-2"
              aria-label="Message input"
            />

            {/* Abort button (visible during streaming) */}
            {sending && (
              <button
                onClick={handleAbort}
                className="shrink-0 p-2 text-error hover:bg-error/10 transition-colors"
                aria-label="Abort"
                title="Abort agent"
              >
                <span className="material-symbols-outlined text-lg">stop</span>
              </button>
            )}

            {/* Send button */}
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || sending}
              className="shrink-0 p-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-primary/20 text-primary hover:bg-primary/30"
              aria-label="Send message"
            >
              <span className="material-symbols-outlined text-lg">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
