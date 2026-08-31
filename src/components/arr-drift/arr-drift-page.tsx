"use client";

import { useCallback, useEffect, useState } from "react";
import type { ArrDriftInstanceResult, ArrDriftReport } from "@/lib/arr-drift";
import { ArrConfigModal } from "@/components/config/arr-config-modal";

const STATUS_STYLE: Record<ArrDriftInstanceResult["status"], string> = {
  baseline: "border-primary/30 bg-primary/10 text-primary",
  match: "border-green-500/30 bg-green-500/10 text-green-400",
  drift: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  error: "border-error/30 bg-error/10 text-error",
  unconfigured: "border-outline-variant/40 bg-surface-container text-on-surface-variant",
  incompatible: "border-outline-variant/40 bg-surface-container text-on-surface-variant",
};

const STATUS_LABEL: Record<ArrDriftInstanceResult["status"], string> = {
  baseline: "Baseline",
  match: "Matches",
  drift: "Drift",
  error: "Unavailable",
  unconfigured: "Not configured",
  incompatible: "Other Arr type",
};

export function ArrDriftPage() {
  const [report, setReport] = useState<ArrDriftReport | null>(null);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async (slug?: string) => {
    setLoading(true);
    setError("");
    try {
      const query = slug ? `?baseline=${encodeURIComponent(slug)}` : "";
      const response = await fetch(`/api/arr-drift${query}`, { cache: "no-store" });
      const data = await response.json() as ArrDriftReport & { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to compare Arr configuration");
      setReport(data);
      setBaseline(data.baselineSlug);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to compare Arr configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const comparable = report?.instances.filter((instance) => instance.status !== "incompatible") ?? [];
  const driftCount = comparable.filter((instance) => instance.status === "drift").length;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Arr Configuration Drift</h1>
          <p className="text-sm text-on-surface-variant">Read-only comparison across the canonical Sonarr and Radarr instances.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="arr-drift-baseline" className="text-sm text-on-surface-variant">Baseline</label>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Arr instances settings"
            className="inline-flex items-center justify-center rounded-[var(--radius-button)] border border-outline-variant/50 bg-surface-container px-3 py-2 text-on-surface transition-colors hover:bg-surface"
          >
            <span className="material-symbols-outlined text-lg">settings</span>
          </button>
          <select
            id="arr-drift-baseline"
            value={baseline}
            disabled={loading || !report}
            onChange={(event) => void load(event.target.value)}
            className="rounded-[var(--radius-button)] border border-outline-variant/50 bg-surface-container px-3 py-2 text-sm text-on-surface"
          >
            {report?.instances.map((instance) => <option key={instance.slug} value={instance.slug}>{instance.name}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void load(baseline)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? "animate-spin" : ""}`}>refresh</span>
            {loading ? "Comparing…" : "Compare"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {error && <div role="alert" className="mb-4 rounded-[var(--radius-card)] border border-error/30 bg-error/10 p-4 text-sm text-error">{error}</div>}
        {report && (
          <>
            <div className="mb-4 rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container-low p-4 text-sm text-on-surface-variant">
              <strong className="text-on-surface">{driftCount} instance{driftCount === 1 ? "" : "s"} with drift.</strong>{" "}
              Sonarr and Radarr are compared separately because their setting schemas differ. No changes are made.
            </div>
            <div className="space-y-3">
              {report.instances.map((instance) => (
                <article key={instance.slug} className={`rounded-[var(--radius-card)] border p-4 ${instance.status === "incompatible" ? "opacity-60" : "border-outline-variant/30 bg-surface-container-low"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-on-surface">{instance.name}</h2>
                      <div className="text-xs uppercase tracking-wider text-on-surface-variant">{instance.type}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[instance.status]}`}>{STATUS_LABEL[instance.status]}</span>
                  </div>
                  {instance.status === "drift" && (
                    <div className="mt-4">
                      <p className="mb-2 text-sm text-on-surface">{instance.name} differs from the selected baseline in {instance.differences.length} setting{instance.differences.length === 1 ? "" : "s"}.</p>
                      <ul className="divide-y divide-outline-variant/20 border-t border-outline-variant/20">
                        {instance.differences.map((difference) => (
                          <li key={difference.category} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div>
                              <div className="text-sm font-medium text-on-surface">{difference.label}</div>
                              <div className="text-xs text-on-surface-variant">{difference.detail}</div>
                            </div>
                            <a href={difference.href} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-primary hover:underline">Open Arr settings ↗</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {instance.error && <p className="mt-3 text-sm text-error">{instance.error}</p>}
                </article>
              ))}
            </div>
          </>
        )}
        {loading && !report && <div className="py-16 text-center text-sm text-on-surface-variant">Comparing Arr settings…</div>}
      </div>
      {showSettings && <ArrConfigModal onClose={() => setShowSettings(false)} />}
    </main>
  );
}
