/**
 * ModelSelector — modal for browsing and selecting Pi models.
 *
 * Populated from Pi's model registry via the /api/pi/state
 * endpoint, which calls `get_available_models` RPC command on the Pi
 * subprocess. Reuses the same modal/search/filter pattern as the old
 * ChatPage's ModelSelector.
 */

"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import type { ThinkingLevel } from "@/lib/pi/event-types";

// ── Types matching Pi's RPC response shape ─────────────────────────────────

export interface PiModelEntry {
  id: string;            // e.g. "anthropic/claude-sonnet-4"
  provider: string;      // e.g. "anthropic"
  providerLabel?: string;
  name: string;
  capabilities?: string[];
  inputPricePerM?: number;
  outputPricePerM?: number;
  contextWindow?: number;
  configured?: boolean;
}

interface ModelSelectorProps {
  open: boolean;
  onClose: () => void;
    activeModelId: string | null;
  onSelect: (modelId: string, provider: string) => void;
}

export function ModelSelector({ open, onClose, activeModelId, onSelect }: ModelSelectorProps) {
  const [models, setModels] = useState<PiModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");

  // Fetch models when modal opens (retries once on 404 for race with SSE connection)
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let retries = 0;

    const fetchModels = () => {
      setLoading(true);
      setError(null);

      fetch(`/api/pi/state/`)
        .then((r) => {
          if (r.status === 404 && retries < 3) {
            // Session may not be created yet — retry after 2s
            retries++;
            setTimeout(() => {
              if (!cancelled) fetchModels();
            }, 2000);
            return null;
          }
          return r.json();
        })
        .then((data) => {
          if (!data || cancelled) return;
          if (data.error) {
            setError(data.error);
          } else if (Array.isArray(data.models)) {
            setModels(data.models);
          } else {
            setError("Unexpected response format");
          }
          setLoading(false);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e.message ?? "Network error");
            setLoading(false);
          }
        });
    };

    fetchModels();
    return () => { cancelled = true; };
  }, [open]);

  // Build sorted models (by inputPricePerM)
  const sorted = [...models].sort(
    (a, b) => (a.inputPricePerM ?? Infinity) - (b.inputPricePerM ?? Infinity),
  );

  const providers = Array.from(new Set(sorted.map((m) => m.provider)));

  const filtered = sorted.filter((m) => {
    if (provider !== "all" && m.provider !== provider) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.providerLabel ?? m.provider).toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
  });

  // Capability chip display helpers
  const capabilityIcons: Record<string, string> = {
    vision: "image",
    tools: "build",
    reasoning: "psychology",
    text: "article",
  };

  return (
    <Modal open={open} onClose={onClose} title="Select model" icon="tune">
      <div className="flex flex-col gap-3">
        {/* Search + provider filter */}
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
              <option key={p} value={p}>
                {models.find((m) => m.provider === p)?.providerLabel ?? p}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="text-sm text-on-surface-variant/60 py-4 text-center">
            Loading models from Pi…
          </div>
        )}

        {error && (
          <div className="px-3 py-2 bg-error/10 text-error text-xs border border-error/30">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-sm text-on-surface-variant/60 py-4 text-center">
            {models.length === 0
              ? "No models returned by Pi. Ensure your API keys are configured."
              : "No models match your filters."}
          </div>
        )}

        {!loading && (
          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {filtered.map((m) => {
              const active = m.id === activeModelId;
              const priceStr =
                m.inputPricePerM != null && m.outputPricePerM != null
                  ? `$${m.inputPricePerM.toFixed(2)} in · $${m.outputPricePerM.toFixed(2)} out /M`
                  : "";

              return (
                <button
                  key={m.id}
                  onClick={() => onSelect(m.id, m.provider)}
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
                      <div className="text-[11px] text-on-surface-variant/70">
                        {m.providerLabel ?? m.provider}
                        {priceStr && <> · {priceStr}</>}
                      </div>
                      {m.contextWindow && (
                        <div className="text-[10px] text-on-surface-variant/50 mt-0.5">
                          {m.contextWindow.toLocaleString()} tokens context
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {m.configured === false ? (
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
                      {m.capabilities && m.capabilities.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {m.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 bg-surface-container-high text-on-surface-variant/70"
                            >
                              <span className="material-symbols-outlined text-[9px]">
                                {capabilityIcons[cap] ?? "check"}
                              </span>
                              {cap}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
