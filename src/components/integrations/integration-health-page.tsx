"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IntegrationHealthItem, IntegrationHealthSnapshot, IntegrationState } from "@/lib/integration-health";
import { ConfigFieldsModal } from "@/components/config/config-fields-modal";
import { ArrConfigModal } from "@/components/config/arr-config-modal";
import { fieldsForGroup, type ConfigFieldGroup } from "@/lib/config-fields";

const STATE_STYLE: Record<IntegrationState, string> = {
  healthy: "border-green-500/30 bg-green-500/10 text-green-400",
  error: "border-error/30 bg-error/10 text-error",
  unconfigured: "border-outline-variant/40 bg-surface-container text-on-surface-variant",
};

type ConfigModalSpec =
  | { kind: "arr" }
  | { kind: "fields"; group: ConfigFieldGroup; title: string; icon: string };

const CONFIGURABLE: Record<string, ConfigModalSpec> = {
  Arr: { kind: "arr" },
  Media: { kind: "fields", group: "media", title: "Plex settings", icon: "video_library" },
  Downloads: { kind: "fields", group: "downloads", title: "Download integrations", icon: "cloud_download" },
  Monitoring: { kind: "fields", group: "monitoring", title: "Pulse settings", icon: "monitor_heart" },
};

function SummaryCard({ label, count, icon, className }: { label: string; count: number; icon: string; className: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container-low p-4">
      <div className={`material-symbols-outlined mb-2 ${className}`}>{icon}</div>
      <div className="text-2xl font-bold text-on-surface">{count}</div>
      <div className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</div>
    </div>
  );
}

function HealthRow({ item }: { item: IntegrationHealthItem }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-outline-variant/20 px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_8rem_6rem]">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-on-surface">{item.name}</div>
        <div className="truncate text-xs text-on-surface-variant sm:hidden">{item.detail}</div>
      </div>
      <div className="hidden truncate text-xs text-on-surface-variant sm:block">{item.detail}</div>
      <div className="flex items-center justify-end gap-2">
        {item.latencyMs !== null && <span className="hidden text-xs font-mono text-on-surface-variant md:inline">{item.latencyMs}ms</span>}
        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${STATE_STYLE[item.state]}`}>
          {item.state}
        </span>
      </div>
    </div>
  );
}

export function IntegrationHealthPage() {
  const [snapshot, setSnapshot] = useState<IntegrationHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState<ConfigModalSpec | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/integrations/health${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const data = await response.json() as IntegrationHealthSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to check integrations");
      setSnapshot(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to check integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const groups = useMemo(() => {
    const result = new Map<string, IntegrationHealthItem[]>();
    for (const item of snapshot?.items ?? []) result.set(item.category, [...(result.get(item.category) ?? []), item]);
    return [...result.entries()];
  }, [snapshot]);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Integration Health</h1>
          <p className="text-sm text-on-surface-variant">Connectivity and credentials across Mission Control.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-lg ${loading ? "animate-spin" : ""}`}>refresh</span>
          {loading ? "Checking…" : "Check now"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {error && <div role="alert" className="mb-4 rounded-[var(--radius-card)] border border-error/30 bg-error/10 p-4 text-sm text-error">{error}</div>}

        {snapshot && (
          <>
            <div className="mb-6 grid grid-cols-3 gap-3">
              <SummaryCard label="Healthy" count={snapshot.summary.healthy} icon="check_circle" className="text-green-400" />
              <SummaryCard label="Errors" count={snapshot.summary.error} icon="error" className="text-error" />
              <SummaryCard label="Not configured" count={snapshot.summary.unconfigured} icon="settings" className="text-on-surface-variant" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {groups.map(([category, items]) => (
                <section key={category} className="overflow-hidden rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container-low">
                  <div className="flex items-center justify-between bg-surface-container px-4 py-3">
                    <h2 className="text-sm font-semibold text-on-surface">{category}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant">{items.length}</span>
                      {CONFIGURABLE[category] && (
                        <button
                          type="button"
                          onClick={() => setOpenModal(CONFIGURABLE[category]!)}
                          aria-label={`${category} settings`}
                          className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface hover:text-on-surface"
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden="true">settings</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {items.map((item) => <HealthRow key={item.id} item={item} />)}
                </section>
              ))}
            </div>

            <p className="mt-4 text-right text-xs text-on-surface-variant">
              Checked {new Date(snapshot.checkedAt).toLocaleString()}
            </p>
          </>
        )}

        {!snapshot && loading && <div className="py-16 text-center text-sm text-on-surface-variant">Checking integrations…</div>}
      </div>
      {openModal?.kind === "arr" && (
        <ArrConfigModal onClose={() => setOpenModal(null)} />
      )}
      {openModal?.kind === "fields" && (
        <ConfigFieldsModal
          fields={fieldsForGroup(openModal.group)}
          title={openModal.title}
          icon={openModal.icon}
          onClose={() => setOpenModal(null)}
        />
      )}
    </main>
  );
}
