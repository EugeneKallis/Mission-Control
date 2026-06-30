"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast-provider";
import type { BlFinderConfig } from "./bl-finder-types";

/**
 * Top-of-page config bar. The form is "draft-then-save" — local edits
 * don't hit the API until the user clicks "Save", at which point we
 * PUT the merged config. The worker reads on its next tick.
 */
export function BlFinderConfigBar({
  config,
  onSaved,
}: {
  config: BlFinderConfig;
  onSaved: (c: BlFinderConfig) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync draft when the loaded config changes (initial load, or after
  // a save that returned a server-merged object).
  useEffect(() => {
    setDraft(config);
    setDirty(false);
  }, [config]);

  const update = <K extends keyof BlFinderConfig>(key: K, value: BlFinderConfig[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/bl-finder/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { config: BlFinderConfig };
      onSaved(data.config);
      toast.showToast("Config saved (worker picks it up on next tick)", "success");
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : "Save failed",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(config);
    setDirty(false);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 mb-3"
      style={{
        background: "#1A1919",
        border: "1px solid rgba(59, 75, 63, 0.3)",
      }}
    >
      <NumField
        label="Interval (s)"
        value={draft.intervalSec}
        onChange={(v) => update("intervalSec", v)}
        min={1}
      />
      <NumField
        label="Batch"
        value={draft.batchSize}
        onChange={(v) => update("batchSize", v)}
        min={1}
      />
      <NumField
        label="Concurrency"
        value={draft.concurrency}
        onChange={(v) => update("concurrency", v)}
        min={1}
      />
      <NumField
        label="Timeout (s)"
        value={draft.timeoutSec}
        onChange={(v) => update("timeoutSec", v)}
        min={1}
      />
      <NumField
        label="Recheck age (d)"
        value={draft.recheckAgeDays}
        onChange={(v) => update("recheckAgeDays", v)}
        min={0}
      />
      <NumField
        label="Discover (s)"
        value={draft.discoverIntervalSec}
        onChange={(v) => update("discoverIntervalSec", v)}
        min={0}
      />
      <div className="flex items-center gap-2 ml-auto">
        {/* Enable/disable toggle */}
        <label
          className="flex items-center gap-2 cursor-pointer select-none shrink-0"
          title={draft.enabled ? "Checker is running" : "Checker is paused"}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: draft.enabled ? "#56FFA7" : "#849587" }}
          >
            {draft.enabled ? "Enabled" : "Disabled"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            onClick={() => update("enabled", !draft.enabled)}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{
              background: draft.enabled ? "#56FFA7" : "rgba(132, 149, 135, 0.3)",
              border: "none",
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow-md"
              style={{
                background: "#1A1919",
                transform: draft.enabled ? "translateX(20px)" : "translateX(0)",
              }}
            />
          </button>
        </label>
        {dirty && (
          <button
            onClick={reset}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold rounded-none"
            style={{ background: "transparent", color: "#849587", border: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            Reset
          </button>
        )}
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-none transition-all"
          style={{
            background: dirty ? "linear-gradient(135deg, #56FFA7, #00FF9C)" : "#201F1F",
            color: dirty ? "#002110" : "#849587",
            border: dirty ? "none" : "1px solid rgba(59, 75, 63, 0.3)",
            cursor: dirty && !saving ? "pointer" : "not-allowed",
          }}
        >
          <span className="material-symbols-outlined text-sm">save</span>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#849587" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.max(min, n));
        }}
        className="w-20 px-2 py-1 text-xs font-mono rounded-none"
        style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
      />
    </label>
  );
}
