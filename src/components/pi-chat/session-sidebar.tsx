/**
 * SessionSidebar — lists persistent Pi sessions and allows switching.
 *
 * Reads session files from ~/.pi/agent/sessions/, shows them sorted
 * newest-first, and lets the user switch, rename, or delete sessions.
 * The active session is highlighted.
 */

"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types matching the API response ────────────────────────────────────────

interface SessionEntry {
  id: string;
  name: string;
  lastModified: string;
  messageCount: number;
  size: number;
}

interface SessionSidebarProps {
  /** Whether the sidebar is open. */
  open: boolean;
  /** Called to close the sidebar. */
  onClose: () => void;
  /** Current active session ID (directory name). */
  activeSessionId: string | null;
  /** Called when the user selects a session to switch to. */
  onSwitchSession: (sessionId: string) => void;
  /** Called when the user wants to create a new session. */
  onNewSession: () => void;
}

/** Format a relative time string from an ISO date. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Shorten a display name or id for the sidebar. */
function displayName(entry: SessionEntry): string {
  // If the name is a raw Pi directory ID (long dashed format), truncate it
  if (entry.name.startsWith("--") && entry.name.length > 30) {
    // Extract the project name from --project-name-- format
    const parts = entry.name.replace(/^--/, "").replace(/--$/, "").split("--");
    return parts[0] ?? `Session ${entry.id.slice(0, 8)}`;
  }
  return entry.name;
}

export function SessionSidebar({
  open,
  onClose,
  activeSessionId,
  onSwitchSession,
  onNewSession,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchSessions = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/pi/sessions")
      .then((r) => r.json())
      .then((data: { sessions?: SessionEntry[]; error?: string }) => {
        if (data.error) setError(data.error);
        else setSessions(data.sessions ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message ?? "Network error");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  // ── Rename session ─────────────────────────────────────────────────────
  const handleRename = useCallback(
    async (id: string, newName: string) => {
      if (!newName.trim()) return;

      try {
        const res = await fetch("/api/pi/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, name: newName.trim() }),
        });
        if (res.ok) {
          setSessions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, name: newName.trim() } : s)),
          );
        }
      } catch {
        // best effort
      }
      setEditingId(null);
    },
    [],
  );

  // ── Delete session ──────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/pi/sessions/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== id));
        }
      } catch {
        // best effort
      }
    },
    [],
  );

  if (!open) return null;

  return (
    <div className="w-[240px] shrink-0 border-r border-outline-variant/30 flex flex-col h-full bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/20 shrink-0">
        <span className="text-xs font-semibold text-on-surface-variant">Sessions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchSessions}
            className="p-0.5 text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
            title="Refresh"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
          <button
            onClick={onNewSession}
            className="p-0.5 text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
            title="New session"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
          </button>
          <button
            onClick={onClose}
            className="p-0.5 text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
            title="Close"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading && sessions.length === 0 && (
          <div className="px-3 py-6 text-xs text-on-surface-variant/60 text-center">
            Loading…
          </div>
        )}

        {error && (
          <div className="mx-2 mt-2 px-2 py-1.5 bg-error/10 text-error text-[10px] border border-error/30">
            {error}
          </div>
        )}

        {!loading && sessions.length === 0 && !error && (
          <div className="px-3 py-6 text-xs text-on-surface-variant/50 text-center">
            No saved sessions yet.
            <br />
            Messages are saved automatically.
          </div>
        )}

        <div className="py-1 space-y-0.5">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;

            return (
              <div
                key={session.id}
                className={`group relative ${
                  isActive ? "bg-primary/10" : "hover:bg-surface-container-high/60"
                }`}
              >
                {editingId === session.id ? (
                  <div className="px-3 py-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(session.id, editName);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleRename(session.id, editName)}
                      className="w-full bg-surface-container-high text-xs text-on-surface px-2 py-1 outline-none border border-primary/50"
                      autoFocus
                      aria-label="Session name"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (!isActive) onSwitchSession(session.id);
                    }}
                    className={`w-full text-left px-3 py-2 ${
                      isActive ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant/50">
                        {isActive ? "chat" : "history"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-on-surface truncate font-medium">
                          {displayName(session)}
                        </div>
                        <div className="text-[10px] text-on-surface-variant/50 flex gap-2">
                          <span>{session.messageCount} msgs</span>
                          <span>{timeAgo(session.lastModified)}</span>
                        </div>
                      </div>
                      {isActive && (
                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                      )}
                    </div>
                  </button>
                )}

                {/* Hover actions */}
                {editingId !== session.id && (
                  <div className="absolute top-1 right-1 hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(session.id);
                        setEditName(session.name);
                      }}
                      className="p-0.5 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
                      title="Rename"
                    >
                      <span className="material-symbols-outlined text-[11px]">edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete session "${displayName(session)}"?`)) {
                          handleDelete(session.id);
                        }
                      }}
                      className="p-0.5 text-on-surface-variant/40 hover:text-error transition-colors"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined text-[11px]">delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
