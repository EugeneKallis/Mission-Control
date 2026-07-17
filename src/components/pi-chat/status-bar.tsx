/**
 * StatusBar — displays current Pi session info in the chat header.
 *
 * Shows: current model, thinking level, context usage, and session stats.
 * Fetches state from /api/pi/state on mount and on refresh.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import type { ThinkingLevel } from "@/lib/pi/event-types";
import type { PiModelEntry } from "./model-selector";

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionStats {
  sessionName?: string;
  messageCount?: number;
  tokenCount?: number;
  contextUsage?: number; // percentage 0–100
  entryCount?: number;
}

interface StateData {
  models?: PiModelEntry[];
  stats?: SessionStats | null;
  state?: {
    model?: string;
    provider?: string;
    thinkingLevel?: ThinkingLevel;
    [key: string]: unknown;
  } | null;
}

interface StatusBarProps {
    /** Whether the SSE connection to Pi is active */
  isConnected: boolean;
  /** Called when the user wants to open the model selector */
  onOpenModelSelector: () => void;
  /** Currently selected model ID (for display) */
  currentModelId: string | null;
  /** Currently selected thinking level */
  thinkingLevel: ThinkingLevel;
  /** Called when thinking level changes */
  onThinkingLevelChange: (level: ThinkingLevel) => void;
}

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];

/** Short label for each thinking level. */
function thinkingLabel(level: ThinkingLevel): string {
  const labels: Record<string, string> = {
    off: "Off",
    minimal: "Min",
    low: "Low",
    medium: "Med",
    high: "High",
    xhigh: "X-High",
    max: "Max",
  };
  return labels[level] ?? level;
}

export function StatusBar({
    isConnected,
  onOpenModelSelector,
  currentModelId,
  thinkingLevel,
  onThinkingLevelChange,
}: StatusBarProps) {
  const [stateData, setStateData] = useState<StateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const fetchState = useCallback(() => {
    setLoading(true);
    fetch(`/api/pi/state/`)
      .then((r) => r.json())
      .then((data: StateData & { error?: string }) => {
        if (!data.error) setStateData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Fetch on mount (only after SSE connection is established)
  useEffect(() => {
    if (!isConnected) return;
    fetchState();
  }, [isConnected, fetchState]);

  // Derive display values: prefer the local selection over fetched state
  const stateModel = stateData?.state?.model;
  const modelName = currentModelId
    ? stateData?.models?.find((m) => m.id === currentModelId)?.name ?? currentModelId
    : typeof stateModel === "object" && stateModel !== null
      ? (stateModel as { name?: string }).name ?? "Unknown model"
      : stateModel ?? "Unknown model";

  const stateProvider = stateData?.state?.provider;
  const providerName = currentModelId
    ? stateData?.models?.find((m) => m.id === currentModelId)?.providerLabel ??
      currentModelId.split("/")[0]
    : typeof stateModel === "object" && stateModel !== null
      ? (stateModel as { provider?: string }).provider ?? ""
      : stateProvider ?? "";

  const stats = stateData?.stats;

  // Context usage bar
  const contextPct =
    typeof stats?.contextUsage === "number" && Number.isFinite(stats.contextUsage)
      ? stats.contextUsage
      : null;

  return (
    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant/60 min-w-0">
      {/* Model badge — clickable to open model selector */}
      <button
        onClick={onOpenModelSelector}
        className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-surface-container-high hover:text-on-surface-variant transition-colors min-w-0"
        title="Click to change model"
      >
        <span className="material-symbols-outlined text-[11px] shrink-0">smart_toy</span>
        <span className="truncate font-medium min-w-0">{modelName}</span>
        {providerName && (
          <span className="hidden md:inline text-[10px] text-on-surface-variant/40 ml-0.5 shrink-0">
            · {providerName}
          </span>
        )}
      </button>

      {/* Thinking level */}
      <div className="relative">
        <button
          onClick={() => setThinkingOpen(!thinkingOpen)}
          className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-surface-container-high hover:text-on-surface-variant transition-colors"
          title="Thinking level"
        >
          <span className="material-symbols-outlined text-[11px]">psychology</span>
          <span>{thinkingLabel(thinkingLevel)}</span>
        </button>

        {thinkingOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setThinkingOpen(false)} />
            <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-outline-variant/30 shadow-xl min-w-[140px]">
              {THINKING_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    onThinkingLevelChange(level);
                    setThinkingOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    level === thinkingLevel
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {thinkingLabel(level)}
                  {level === "off" && " — No reasoning"}
                  {level === "minimal" && " — Minimal thinking"}
                  {level === "low" && " — Light reasoning"}
                  {level === "medium" && " — Balanced"}
                  {level === "high" && " — Deep reasoning"}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Context usage */}
      {contextPct !== null && (
        <div
          className="hidden md:flex items-center gap-1"
          title={`Context usage: ${Math.round(contextPct)}%`}
        >
          <div className="w-12 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                contextPct > 80 ? "bg-error" : contextPct > 60 ? "bg-warning" : "bg-primary"
              }`}
              style={{ width: `${Math.min(contextPct, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-on-surface-variant/50">{Math.round(contextPct)}%</span>
        </div>
      )}

      {/* Message count */}
      {stats?.messageCount != null && (
        <span
          className="hidden md:inline text-[10px] text-on-surface-variant/40"
          title="Messages in this session"
        >
          {stats.messageCount} msgs
        </span>
      )}

      {/* Refresh button */}
      <button
        onClick={fetchState}
        disabled={loading}
        className={`p-0.5 hover:text-on-surface-variant transition-colors ${
          loading ? "animate-spin" : ""
        }`}
        title="Refresh session state"
      >
        <span className="material-symbols-outlined text-[11px]">refresh</span>
      </button>
    </div>
  );
}
