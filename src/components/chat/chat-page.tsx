"use client";

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent, type ChangeEvent,
} from "react";
import { useToast } from "@/components/toast-provider";
import { Modal } from "@/components/ui/modal";
import {
  categorizeAttachment,
  isTextLike,
} from "@/lib/chat/models";
import type {
  ChatMessage,
  ChatSessionSummary,
  ChatSessionDetail,
  PendingAttachment,
  ModelEntry,
  ModelsResponse,
  SendMessageBody,
} from "./chat-types";

/* ── Constants ──────────────────────────────────────────────────────────── */

const MAX_TEXT_ATTACHMENT_BYTES = 200_000;
let attachSeq = 0;
function nextAttachId(): string {
  return `att-${Date.now()}-${attachSeq++}`;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncateTitle(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  return t.length > 40 ? t.slice(0, 40) + "…" : t || "New conversation";
}

/** Whether a model can ingest a pending attachment (for the warning UI). */
function attachmentSupportedBy(model: ModelEntry | undefined, att: PendingAttachment): boolean {
  if (att.kind === "text") return true;
  if (att.kind === "image") return !!model?.capabilities.includes("vision");
  return false; // unsupported file types (audio/pdf/binary)
}

function reasonFor(att: PendingAttachment, model?: ModelEntry): string {
  if (att.kind === "unsupported") return `${att.name}: this file type can't be sent to any model`;
  if (att.kind === "image") return `${att.name}: ${model?.name ?? "This model"} has no vision support`;
  return `${att.name}: not supported`;
}

/** Read a File into a PendingAttachment (text inline, image as data URL). */
function readAttachment(file: File): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    const base: PendingAttachment = {
      id: nextAttachId(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind: "unsupported",
    };
    if (file.type.startsWith("image/")) {
      reader.onload = () => resolve({ ...base, kind: "image", dataUrl: String(reader.result) });
      reader.readAsDataURL(file);
    } else if (isTextLike(file.name, file.type)) {
      reader.onload = () => {
        const text = String(reader.result ?? "");
        if (text.length > MAX_TEXT_ATTACHMENT_BYTES) {
          resolve({
            ...base,
            kind: "text",
            text: text.slice(0, MAX_TEXT_ATTACHMENT_BYTES),
            truncated: true,
          });
        } else {
          resolve({ ...base, kind: "text", text });
        }
      };
      reader.readAsText(file);
    } else {
      // unsupported attachment — kept so the warning UI can show it; not sent.
      resolve(base);
    }
  });
}

/* ── API helpers ─────────────────────────────────────────────────────────── */

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

function ChatEmptyState({
  icon, title, description,
}: { icon: string; title: string; description: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-3 p-8">
      <span className="material-symbols-outlined text-5xl opacity-40">{icon}</span>
      <p className="text-lg font-display font-semibold text-on-surface/60">{title}</p>
      <p className="text-sm max-w-md text-center">{description}</p>
    </div>
  );
}

/* ── Message bubble ──────────────────────────────────────────────────────── */

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-none flex items-center justify-center shrink-0 ${
          isUser ? "bg-primary/20 text-primary" : "bg-surface-container-high text-on-surface-variant"
        }`}
      >
        <span className="material-symbols-outlined text-sm">
          {isUser ? "person" : "smart_toy"}
        </span>
      </div>
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <span className="text-[11px] text-on-surface-variant/60 font-medium">
          {isUser ? "You" : "Assistant"}
        </span>
        <div
          className={`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser ? "bg-primary/15 text-on-surface" : "bg-surface-container-high text-on-surface"
          }`}
        >
          {message.content}
        </div>
        {message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1 ${isUser ? "justify-end" : "justify-start"}`}>
            {message.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-surface-container-high/70 text-on-surface-variant"
                title={`${a.name} (${a.mimeType})`}
              >
                <span className="material-symbols-outlined text-xs">
                  {a.category === "image" ? "image" : "description"}
                </span>
                {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */

function ChatSidebar({
  sessions, activeId, onSelect, onNew, onDelete, variant, onClose,
}: {
  sessions: ChatSessionSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  variant: "desktop" | "mobile";
  onClose?: () => void;
}) {
  const inner = (
    <div className="flex flex-col h-full">
      <div className="p-3 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold transition-colors border border-primary/20 text-primary hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-on-surface-variant/50">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-1 cursor-pointer transition-colors ${
                  s.id === activeId ? "bg-surface-container-high" : "hover:bg-surface-container-high/60"
                }`}
              >
                <button onClick={() => onSelect(s.id)} className="flex-1 text-left px-3 py-2 min-w-0">
                  <div className="text-xs font-medium text-on-surface truncate">{s.title}</div>
                  <div className="text-[10px] text-on-surface-variant/50 mt-0.5">
                    {formatTime(s.updatedAt)}
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  className="p-1.5 mr-1 opacity-0 group-hover:opacity-100 hover:bg-error/10 text-on-surface-variant hover:text-error transition-all"
                  aria-label={`Delete ${s.title}`}
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
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
      {onClose && (
        <div
          className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
      <div className="fixed inset-y-0 left-0 w-[280px] bg-surface shadow-2xl z-50 md:hidden flex flex-col">
        {inner}
      </div>
    </>
  );
}

/* ── Model selector modal ─────────────────────────────────────────────────── */

function ModelSelector({
  open, onClose, models, activeModelId, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelEntry[];
  activeModelId: string;
  onSelect: (modelId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");

  const providers = Array.from(new Set(models.map((m) => m.provider)));
  const filtered = models.filter((m) => {
    if (provider !== "all" && m.provider !== provider) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.providerLabel.toLowerCase().includes(q);
  });

  return (
    <Modal open={open} onClose={onClose} title="Select model" icon="tune">
      <div className="flex flex-col gap-3">
        {/* search + provider filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="flex-1 bg-surface-container-high text-sm text-on-surface px-3 py-2 outline-none border border-outline-variant/30 focus:border-primary/50"
            aria-label="Search models"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="bg-surface-container-high text-sm text-on-surface px-2 py-2 outline-none border border-outline-variant/30"
            aria-label="Filter by provider"
          >
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>{models.find((m) => m.provider === p)?.providerLabel ?? p}</option>
            ))}
          </select>
        </div>

        <p className="text-[11px] text-on-surface-variant/60">
          Sorted by price (cheapest first). Prices are USD per 1M tokens.
        </p>

        <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {filtered.map((m) => {
            const active = m.id === activeModelId;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={`text-left px-3 py-2.5 border transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-outline-variant/20 hover:border-primary/40 hover:bg-surface-container-high/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-on-surface truncate flex items-center gap-2">
                      {m.name}
                      {active && (
                        <span className="material-symbols-outlined text-base text-primary">check_circle</span>
                      )}
                    </div>
                    <div className="text-[11px] text-on-surface-variant/70">{m.providerLabel} · {m.price}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {!m.configured ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-warning/15 text-warning">
                        <span className="material-symbols-outlined text-[11px]">key_off</span>
                        needs key
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-primary/15 text-primary">
                        <span className="material-symbols-outlined text-[11px]">check</span>
                        ready
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {m.chips.map((c) => (
                    <span
                      key={c.key}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant"
                    >
                      <span className="material-symbols-outlined text-[11px]">{c.icon}</span>
                      {c.label}
                    </span>
                  ))}
                  <span className="text-[10px] px-1.5 py-0.5 text-on-surface-variant/50">
                    {m.contextWindow.toLocaleString()} ctx
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-on-surface-variant/50 py-6">No models match</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Pending attachments bar ─────────────────────────────────────────────── */

function AttachmentChip({
  att, model, onRemove,
}: {
  att: PendingAttachment;
  model?: ModelEntry;
  onRemove: (id: string) => void;
}) {
  const supported = attachmentSupportedBy(model, att);
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 border ${
        supported
          ? "bg-surface-container-high text-on-surface border-outline-variant/30"
          : "bg-error/10 text-error border-error/30"
      }`}
      title={supported ? att.name : reasonFor(att, model)}
    >
      <span className="material-symbols-outlined text-sm">
        {att.kind === "image" ? "image" : att.kind === "text" ? "description" : "block"}
      </span>
      <span className="max-w-[140px] truncate">{att.name}</span>
      {att.truncated && <span className="text-[10px] text-on-surface-variant/60">· truncated</span>}
      {!supported && <span className="material-symbols-outlined text-sm" title={reasonFor(att, model)}>warning</span>}
      <button
        onClick={() => onRemove(att.id)}
        className="text-on-surface-variant hover:text-error"
        aria-label={`Remove ${att.name}`}
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </span>
  );
}

/* ── Main page component ──────────────────────────────────────────────────── */

export function ChatPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSessionDetail | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("opencode-go/deepseek-v4-flash");
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [booted, setBooted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeModelId = activeSession?.model ?? defaultModelId;
  const activeModel = models.find((m) => m.id === activeModelId);

  // ── load model catalog ───────────────────────────────────────────────────
  useEffect(() => {
    api<ModelsResponse>("/api/chat/models")
      .then((r) => {
        setModels(r.models);
        setDefaultModelId(r.defaultModelId);
      })
      .catch((e) => toast.showToast(`Failed to load models: ${e.message}`, "error"));
  }, [toast]);

  // ── load sessions on mount ───────────────────────────────────────────────
  const refreshSessions = useCallback(async () => {
    try {
      const list = await api<ChatSessionSummary[]>("/api/chat/sessions");
      setSessions(list);
      return list;
    } catch (e) {
      toast.showToast(`Failed to load chats: ${e instanceof Error ? e.message : e}`, "error");
      return [];
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      const list = await refreshSessions();
      if (list.length > 0) {
        setActiveSessionId(list[0].id);
      } else {
        // No sessions yet — create the first one.
        try {
          const s = await api<ChatSessionSummary>("/api/chat/sessions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          });
          setSessions([s]);
          setActiveSessionId(s.id);
        } catch (e) {
          toast.showToast(`Failed to start chat: ${e instanceof Error ? e.message : e}`, "error");
        }
      }
      setBooted(true);
    })();
  }, [refreshSessions, toast]);

  // ── load active session detail ───────────────────────────────────────────
  useEffect(() => {
    if (activeSessionId == null) {
      setActiveSession(null);
      return;
    }
    setLoadingMessages(true);
    api<ChatSessionDetail>(`/api/chat/sessions/${activeSessionId}`)
      .then(setActiveSession)
      .catch((e) => toast.showToast(`Failed to load conversation: ${e.message}`, "error"))
      .finally(() => setLoadingMessages(false));
  }, [activeSessionId, toast]);

  // ── auto-scroll + auto-resize ────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages.length]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  // ── handlers ──────────────────────────────────────────────────────────────
  async function handleNewChat() {
    try {
      const s = await api<ChatSessionSummary>("/api/chat/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: activeModelId }),
      });
      setSessions((prev) => [s, ...prev]);
      setActiveSessionId(s.id);
      setMobileSidebarOpen(false);
    } catch (e) {
      toast.showToast(`Failed to create chat: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  async function handleSelectConversation(id: number) {
    setActiveSessionId(id);
    setMobileSidebarOpen(false);
  }

  async function handleDeleteConversation(id: number) {
    // optimistic
    const prev = sessions;
    setSessions((s) => s.filter((c) => c.id !== id));
    try {
      await api(`/api/chat/sessions/${id}`, { method: "DELETE" });
    } catch (e) {
      setSessions(prev);
      toast.showToast(`Failed to delete: ${e instanceof Error ? e.message : e}`, "error");
      return;
    }
    if (activeSessionId === id) {
      const rest = prev.filter((c) => c.id !== id);
      if (rest.length > 0) setActiveSessionId(rest[0].id);
      else {
        // recreate a starter session
        try {
          const s = await api<ChatSessionSummary>("/api/chat/sessions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          });
          setSessions([s]);
          setActiveSessionId(s.id);
        } catch {
          setActiveSessionId(null);
        }
      }
    }
  }

  async function handleSelectModel(modelId: string) {
    if (!activeSession) {
      // no session yet — just remember as the default for the next session
      setDefaultModelId(modelId);
      setModelSelectorOpen(false);
      return;
    }
    if (modelId === activeSession.model) {
      setModelSelectorOpen(false);
      return;
    }
    try {
      const updated = await api<ChatSessionSummary>(
        `/api/chat/sessions/${activeSession.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: modelId }),
        },
      );
      setActiveSession((s) => (s ? { ...s, model: updated.model } : s));
      setSessions((prev) => prev.map((c) => (c.id === updated.id ? { ...c, model: updated.model } : c)));
      const m = models.find((x) => x.id === modelId);
      toast.showToast(`Switched to ${m?.name ?? modelId}`, "success");
    } catch (e) {
      toast.showToast(`Failed to switch model: ${e instanceof Error ? e.message : e}`, "error");
    }
    setModelSelectorOpen(false);
  }

  // ── attachments ───────────────────────────────────────────────────────────
  const unsupportedAttachments = attachments.filter((a) => !attachmentSupportedBy(activeModel, a));

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const read = await Promise.all(files.map(readAttachment)).catch((err) => {
      toast.showToast(`Failed to read file: ${err instanceof Error ? err.message : err}`, "error");
      return [] as PendingAttachment[];
    });
    setAttachments((prev) => [...prev, ...read]);
    // reset input so the same file can be re-added
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  }

  async function handleSendMessage() {
    if (!activeSession || sending) return;
    const text = inputText.trim();
    const sendable = attachments.filter((a) => a.kind === "text" || a.kind === "image");
    if (!text && sendable.length === 0) return;
    if (unsupportedAttachments.length > 0) {
      toast.showToast(
        `Remove the unsupported attachment(s) or switch to a Vision model`,
        "error",
      );
      return;
    }

    const content = text || "(see attached file)";
    const body: SendMessageBody = {
      content,
      attachments: sendable.map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        kind: a.kind as "text" | "image",
        text: a.text,
        dataUrl: a.dataUrl,
      })),
    };

    // optimistic user message
    const optimisticUser: ChatMessage = {
      id: -Date.now(),
      role: "user",
      content,
      attachments: sendable.map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        category: categorizeAttachment(a) as string,
      })),
      createdAt: new Date().toISOString(),
    };
    setActiveSession((s) =>
      s ? { ...s, messages: [...s.messages, optimisticUser] } : s,
    );
    setInputText("");
    setAttachments([]);
    setSending(true);

    try {
      const res = await api<{ userMessage: ChatMessage; assistantMessage: ChatMessage; error?: string }>(
        `/api/chat/sessions/${activeSession.id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      // Replace optimistic user message with the persisted one, append assistant.
      setActiveSession((s) => {
        if (!s) return s;
        const trimmed = s.messages.filter((m) => m.id !== optimisticUser.id);
        return { ...s, messages: [...trimmed, res.userMessage, res.assistantMessage] };
      });
      // Auto-title: if still "New conversation", set a title from the first message.
      if (activeSession.title === "New conversation") {
        const newTitle = truncateTitle(content);
        void api(`/api/chat/sessions/${activeSession.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        }).then(() => {
          setSessions((prev) => prev.map((c) => (c.id === activeSession.id ? { ...c, title: newTitle } : c)));
          setActiveSession((s) => (s && s.id === activeSession.id ? { ...s, title: newTitle } : s));
        }).catch(() => {/* non-fatal */});
      }
      setSessions((prev) =>
        prev.map((c) => (c.id === activeSession.id ? { ...c, updatedAt: new Date().toISOString() } : c)),
      );
    } catch (e) {
      // revert optimistic message, surface error
      setActiveSession((s) => (s ? { ...s, messages: s.messages.filter((m) => m.id !== optimisticUser.id) } : s));
      setInputText(content);
      setAttachments(attachments);
      toast.showToast(`Failed to send: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setSending(false);
    }
  }

  const canSend =
    !!activeSession &&
    !sending &&
    unsupportedAttachments.length === 0 &&
    (inputText.trim().length > 0 || attachments.some((a) => a.kind === "text" || a.kind === "image"));

  const showMediaWarning = unsupportedAttachments.length > 0;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full relative">
      <ChatSidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        variant="desktop"
      />

      {mobileSidebarOpen && (
        <ChatSidebar
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
          variant="mobile"
          onClose={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Model selector */}
      {models.length > 0 && (
        <ModelSelector
          open={modelSelectorOpen}
          onClose={() => setModelSelectorOpen(false)}
          models={models}
          activeModelId={activeModelId}
          onSelect={handleSelectModel}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header: mobile menu + model selector */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/30 shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-1 text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label="Open conversation list"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>

          <button
            onClick={() => setModelSelectorOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 border border-outline-variant/30 hover:border-primary/40 transition-colors min-w-0"
            aria-label="Select model"
            title="Select model"
          >
            <span className="material-symbols-outlined text-base text-primary">smart_toy</span>
            <span className="text-xs font-medium text-on-surface truncate max-w-[40vw]">
              {activeModel ? activeModel.name : "Select model"}
            </span>
            {activeModel && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-on-surface-variant/70">
                {activeModel.chips.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">{c.icon}</span>
                    {c.label}
                  </span>
                ))}
              </span>
            )}
            <span className="material-symbols-outlined text-base text-on-surface-variant">expand_more</span>
          </button>

          <div className="flex-1" />
          <span className="hidden md:block text-[11px] text-on-surface-variant/60 truncate">
            {activeSession?.title ?? ""}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {loadingMessages && !activeSession ? (
            <ChatEmptyState icon="progress_activity" title="Loading…" description="Fetching conversation." />
          ) : !activeSession ? (
            <ChatEmptyState
              icon="chat"
              title="No conversation selected"
              description="Select a conversation from the sidebar or start a new one."
            />
          ) : activeSession.messages.length === 0 ? (
            <ChatEmptyState
              icon="chat"
              title="Start a conversation"
              description={`Type a message below to chat with ${activeModel?.name ?? "the assistant"}.`}
            />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {activeSession.messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}
              {sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-none flex items-center justify-center bg-surface-container-high text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  </div>
                  <span className="text-xs text-on-surface-variant/60 self-center">Thinking…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-outline-variant/30 bg-bg">
          <div className="max-w-3xl mx-auto px-4 py-3">
            {booted && (
              <>
                {/* media warning */}
                {showMediaWarning && (
                  <div className="flex items-start gap-2 mb-2 px-3 py-2 bg-warning/10 text-warning text-xs border border-warning/30">
                    <span className="material-symbols-outlined text-base">warning</span>
                    <div>
                      {unsupportedAttachments.length} attachment(s) can&apos;t be read by{" "}
                      <strong>{activeModel?.name ?? "this model"}</strong>. Remove them or pick a
                      Vision-capable model.
                    </div>
                  </div>
                )}

                {/* pending attachments */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attachments.map((a) => (
                      <AttachmentChip
                        key={a.id}
                        att={a}
                        model={activeModel}
                        onRemove={handleRemoveAttachment}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex items-end gap-2 bg-surface-container-high p-2">
              {/* attach button */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFiles}
                aria-label="Attach files"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 p-2 text-on-surface-variant hover:text-primary transition-colors"
                aria-label="Attach files"
                title="Attach files (images need a Vision model)"
              >
                <span className="material-symbols-outlined text-lg">attach_file</span>
              </button>

              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeModel ? `Message ${activeModel.name}…` : "Type a message…"}
                rows={1}
                className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/40 resize-none outline-none min-h-[36px] max-h-[160px] py-1.5 px-2"
                aria-label="Message input"
              />
              <button
                onClick={handleSendMessage}
                disabled={!canSend}
                className="shrink-0 p-2 rounded-none transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-primary/20 text-primary hover:bg-primary/30"
                aria-label="Send message"
              >
                <span className="material-symbols-outlined text-lg">send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}