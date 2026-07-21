/**
 * usePiModels — shared hook for fetching Pi's/model registry.
 *
 * Encapsulates the fetch-from-`/api/pi/state` + 404-retry-up-to-3 +
 * 2s-backoff + unmount-cleanup logic previously inlined in
 * `<ModelSelector>`. Both the chat ModelSelector modal and the
 * agent-task form consume this hook.
 *
 * @param enabled — when false, no fetch happens (defaults true). Pass
 *   `false` from a modal that shouldn't spawn pi until opened; leave
 *   unset to boot the pi process on mount.
 */

"use client";

import { useEffect, useState } from "react";

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

export function usePiModels(
  enabled: boolean = true,
): { models: PiModelEntry[]; loading: boolean; error: string | null } {
  const [models, setModels] = useState<PiModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let retries = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;

    const fetchModels = () => {
      setLoading(true);
      setError(null);

      fetch(`/api/pi/state/`)
        .then((r) => {
          if (r.status === 404 && retries < 3) {
            // Session may not be created yet — retry after 2s
            retries++;
            retryTimeout = setTimeout(() => {
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

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [enabled]);

  return { models, loading, error };
}