import React, { useState, useEffect, useRef, useCallback } from "react";
import { Nav } from "../components/Nav";
import { Header } from "../components/Header";
import { getApiBase } from "../lib/apiBase";
import ChatMessage from "../components/ChatMessage";
import AttachmentChip from "../components/AttachmentChip";

const STORAGE_KEY_CONVERSATIONS = "pi-chat-conversations";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_MIME_PREFIXES = ["image/", "text/", "application/pdf"];

// ─── Helpers ───────────────────────────────────────────────────────────

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs) {
  try {
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(convs));
  } catch {
    // localStorage full — silent
  }
}

function makeId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

function getFirstMessage(conv) {
  for (const m of conv.messages || []) {
    if (m.role === "user") return m.content?.slice(0, 60) || "Chat";
  }
  return "Chat";
}

// ─── Component ─────────────────────────────────────────────────────────

export default function Chat() {
  const apiBase = getApiBase();

  // Conversations
  const [conversations, setConversations] = useState(() => loadConversations());
  const [activeConvId, setActiveConvId] = useState(null);
  const [now, setNow] = useState(new Date());

  // Messages
  const [messages, setMessages] = useState([]);

  // Models & providers from backend
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);

  // Selection
  const [selectedProvider, setSelectedProvider] = useState("opencode-go");
  const [selectedModel, setSelectedModel] = useState("opencode-go/deepseek-v4-flash");

  // Input
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [mediaWarning, setMediaWarning] = useState("");

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Clock ────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // ── Load models & providers ──────────────────────────────────────────
  useEffect(() => {
    async function fetchConfig() {
      try {
        const [modelsRes, providersRes] = await Promise.all([
          fetch(`${apiBase}/chat/models`),
          fetch(`${apiBase}/chat/providers`),
        ]);
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setModels(data.models || []);
        }
        if (providersRes.ok) {
          const data = await providersRes.json();
          setProviders(data.providers || []);
        }
      } catch (err) {
        console.error("Failed to load chat config:", err);
      }
    }
    fetchConfig();
  }, [apiBase]);

  // ── Restore model per conversation from localStorage ────────────────
  useEffect(() => {
    if (!activeConvId) return;
    const conv = conversations.find((c) => c.id === activeConvId);
    if (conv) {
      setMessages(conv.messages || []);
      if (conv.model) setSelectedModel(conv.model);
      if (conv.provider) setSelectedProvider(conv.provider);
    } else {
      setMessages([]);
    }
  }, [activeConvId, conversations]);

  // ── Auto-scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Media capability check ───────────────────────────────────────────
  const checkMediaCapability = useCallback(
    (modelId, files) => {
      if (!files || files.length === 0) {
        setMediaWarning("");
        return;
      }
      const model = models.find((m) => m.id === modelId);
      if (!model) return;
      const caps = model.capabilities || [];
      const hasVision = caps.includes("vision");
      const nonTextFiles = files.filter(
        (f) => f.type && !f.type.startsWith("text/"),
      );
      if (nonTextFiles.length > 0 && !hasVision) {
        setMediaWarning(
          `"${model.name}" does not support vision/image input. Non-text attachments may not be processed correctly.`,
        );
      } else {
        setMediaWarning("");
      }
    },
    [models],
  );

  // ── When model changes, re-check media capability ────────────────────
  useEffect(() => {
    checkMediaCapability(selectedModel, attachments);
  }, [selectedModel, attachments, checkMediaCapability]);

  // ── Conversation helpers ─────────────────────────────────────────────
  function ensureActiveConv() {
    if (activeConvId) {
      return { id: activeConvId, updatedConvs: conversations };
    }
    const id = makeId();
    const conv = {
      id,
      messages: [],
      model: selectedModel,
      provider: selectedProvider,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updatedConvs = [conv, ...conversations];
    setConversations(updatedConvs);
    saveConversations(updatedConvs);
    setActiveConvId(id);
    return { id, updatedConvs };
  }

  function updateConv(convMessages, model, provider) {
    const { id, updatedConvs } = ensureActiveConv();
    const next = updatedConvs.map((c) => {
      if (c.id !== id) return c;
      return {
        ...c,
        messages: convMessages,
        model: model || c.model,
        provider: provider || c.provider,
        updatedAt: new Date().toISOString(),
      };
    });
    setConversations(next);
    saveConversations(next);
  }

  function switchConversation(id) {
    if (sending) return;
    setActiveConvId(id);
    setAttachments([]);
    setMediaWarning("");
  }

  function newConversation() {
    if (sending) return;
    setActiveConvId(null);
    setMessages([]);
    setAttachments([]);
    setMediaWarning("");
  }

  function deleteConversation(id, e) {
    e.stopPropagation();
    if (sending) return;
    const next = conversations.filter((c) => c.id !== id);
    setConversations(next);
    saveConversations(next);
    if (activeConvId === id) {
      setActiveConvId(next[0]?.id || null);
      setMessages(next[0]?.messages || []);
    }
  }

  // ── File attachment handling ─────────────────────────────────────────
  function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_FILES - attachments.length;
    if (remaining <= 0) {
      setMediaWarning("Maximum 5 files per message.");
      return;
    }

    const toAdd = files.slice(0, remaining);
    const errors = [];
    const newAttachments = [];

    for (const file of toAdd) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const isAllowed = ALLOWED_MIME_PREFIXES.some((p) =>
        file.type.startsWith(p),
      );
      if (!isAllowed && file.type) {
        errors.push(`${file.name} has unsupported type (${file.type})`);
        continue;
      }
      newAttachments.push(file);
    }

    if (errors.length > 0) {
      setMediaWarning(errors.join(". "));
    }

    if (newAttachments.length === 0) return;

    Promise.all(
      newAttachments.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                name: file.name,
                type: file.type || "application/octet-stream",
                size: file.size,
                data: reader.result.split(",")[1] || "",
              });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    ).then((processed) => {
      setAttachments((prev) => [...prev, ...processed]);
      checkMediaCapability(selectedModel, [...attachments, ...processed]);
    });

    e.target.value = "";
  }

  function removeAttachment(att) {
    setAttachments((prev) => prev.filter((a) => a !== att));
  }

  // ── Send message ─────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (sending) return;

    const modelId = selectedModel;
    const providerId = selectedProvider;

    // Optimistically add user message
    const userMsg = {
      role: "user",
      content: text || "(attachment)",
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    setMessages([...messages, userMsg]);
    setInput("");
    setSending(true);

    // Add a pending assistant message
    const pendingMsg = { role: "assistant", content: "", pending: true };
    setMessages((prev) => [...prev, pendingMsg]);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          provider: providerId,
          model: modelId,
          history,
          attachments: attachments.map((a) => ({
            name: a.name,
            type: a.type,
            data: a.data,
          })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg = {
        role: "assistant",
        content: data.content || "",
        model: data.model || modelId,
      };

      // Replace the pending message with the real one
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = assistantMsg;
        return next;
      });

      updateConv(
        [
          ...messages,
          { role: "user", content: text || "(attachment)" },
          assistantMsg,
        ],
        modelId,
        providerId,
      );
      setAttachments([]);
      setMediaWarning("");
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: `**Error**: ${err.message || "Failed to send message. Please try again."}`,
          model: "",
          error: true,
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  // ── Keyboard shortcut ────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Filter models by selected provider ───────────────────────────────
  const filteredModels = models.filter(
    (m) => m.provider === selectedProvider,
  );

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Header connected={false} connection={null} lastUpdate={null} now={now} subtitle="Chat with PI agent" />

      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-4 overflow-hidden">
        <div className="mb-4 shrink-0">
          <Nav />
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* ── Sidebar ────────────────────────────────────────────────── */}
          <aside className="w-64 shrink-0 bg-slate-900/50 border border-slate-800 rounded-lg flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-800">
              <button
                onClick={newConversation}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
              >
                + New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-8">
                  No conversations yet
                </p>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => switchConversation(conv.id)}
                  className={`group flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors ${
                    conv.id === activeConvId
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs">
                      {getFirstMessage(conv)}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      {formatTimestamp(conv.updatedAt)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-xs"
                    title="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Main Chat Area ─────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
            {/* Provider/Model Selector */}
            <div className="shrink-0 p-3 border-b border-slate-800 bg-slate-900/80">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Provider:</label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {providers.length === 0 && (
                      <option value="opencode-go">OpenCode Zen Go</option>
                    )}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Model:</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 max-w-[240px]"
                  >
                    {filteredModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    {filteredModels.length === 0 && (
                      <option value="opencode-go/deepseek-v4-flash">
                        DeepSeek V4 Flash
                      </option>
                    )}
                  </select>
                </div>
                {/* Model detail tooltip */}
                {filteredModels.find((m) => m.id === selectedModel) && (
                  <div className="text-[10px] text-slate-500 hidden md:block">
                    {(() => {
                      const m = filteredModels.find(
                        (x) => x.id === selectedModel,
                      );
                      if (!m) return null;
                      const caps = (m.capabilities || [])
                        .map((c) => {
                          const labels = {
                            text: "Text",
                            vision: "Vision",
                            tools: "Tools",
                            thinking: "Thinking",
                          };
                          return labels[c] || c;
                        })
                        .join(", ");
                      const ctx = m.context_length
                        ? `${(m.context_length / 1000).toFixed(0)}K ctx`
                        : "";
                      const price = `$${m.pricing?.input?.toFixed(2)} in / $${m.pricing?.output?.toFixed(2)} out`;
                      return `${caps} · ${ctx} · ${price}`;
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-slate-500">
                    <div className="text-4xl mb-2">💬</div>
                    <p className="text-sm">
                      Send a message to start chatting with the PI agent.
                    </p>
                    <p className="text-xs mt-1 text-slate-600">
                      Select a model above and type your message below.
                    </p>
                  </div>
                </div>
              )}
              {messages.map((msg, i) =>
                msg.pending ? (
                  <div key={i} className="flex justify-start mb-4">
                    <div className="bg-slate-800 text-slate-100 rounded-lg rounded-bl-sm px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="animate-pulse">●</span>
                        <span>Thinking...</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ChatMessage key={i} message={msg} />
                ),
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Media warning */}
            {mediaWarning && (
              <div className="shrink-0 px-4 py-2 bg-amber-900/30 border-t border-amber-800/50 text-xs text-amber-300">
                ⚠ {mediaWarning}
              </div>
            )}

            {/* Input area */}
            <div className="shrink-0 border-t border-slate-800 p-3">
              {/* Attachment chips */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {attachments.map((att, i) => (
                    <AttachmentChip
                      key={i}
                      attachment={att}
                      onRemove={removeAttachment}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="flex-1 flex items-end gap-2 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none resize-none max-h-32"
                    style={{ minHeight: "20px" }}
                    onInput={(e) => {
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                    }}
                    disabled={sending}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || attachments.length >= MAX_FILES}
                    className="shrink-0 px-2 py-1 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
                    title="Attach files"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,text/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={sending || (!input.trim() && attachments.length === 0)}
                  className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <span className="flex items-center gap-1">
                      <span className="animate-pulse">●</span> Send
                    </span>
                  ) : (
                    "Send"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
