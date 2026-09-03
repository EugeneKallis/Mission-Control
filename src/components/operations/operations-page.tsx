"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast-provider";
import type {
  OperationsSnapshot,
  PublicOperationsConfig,
  ReleaseStatus,
  TlsTarget,
} from "@/lib/operations";


function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Never";
}


function statusClass(ok: boolean): string {
  return ok ? "text-success" : "text-error";
}
function buildReleaseUpdatePrompt(releases: ReleaseStatus[]): string {
  const copyableReleases = releases.filter((release) => !release.error && release.tag !== "unknown");
  if (copyableReleases.length === 0) return "";
  return [
    "Update the LXCs associated with these GitHub releases, then verify each service is healthy:",
    ...copyableReleases.map((release) => `- ${release.repo} (${release.tag})`),
  ].join("\n");
}

function Card({
  title,
  icon,
  onConfigure,
  children,
}: {
  title: string;
  icon: string;
  onConfigure?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-on-surface">
          <span aria-hidden="true" className="material-symbols-outlined text-primary">{icon}</span>
          {title}
        </h2>
        {onConfigure && (
          <button
            type="button"
            aria-label={`Configure ${title}`}
            onClick={onConfigure}
            className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <span aria-hidden="true" className="material-symbols-outlined">settings</span>
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

type SettingsSection = "releases" | "adguard" | "tls";

const SETTINGS_META: Record<SettingsSection, { title: string; icon: string }> = {
  releases: { title: "Release radar", icon: "new_releases" },
  adguard: { title: "AdGuard DNS", icon: "dns" },
  tls: { title: "TLS certificates", icon: "verified_user" },
};
const CONFIG_SAVE_LABELS: Record<SettingsSection, string> = {
  releases: "Save release settings",
  adguard: "Save AdGuard settings",
  tls: "Save TLS settings",
};


interface ConfigDraft {
  githubRepos: string;
  adguardUrl: string;
  adguardUsername: string;
  adguardPassword: string;
  tlsTargets: string;
}

function draftFromConfig(config: PublicOperationsConfig): ConfigDraft {
  return {
    githubRepos: config.githubRepos.join("\n"),
    adguardUrl: config.adguardUrl,
    adguardUsername: config.adguardUsername,
    adguardPassword: "",
    tlsTargets: config.tlsTargets.map((item) => `${item.name},${item.host},${item.port}`).join("\n"),
  };
}

function parseTlsTargets(value: string): TlsTarget[] {
  return value.split("\n").filter((line) => line.trim()).map((line) => {
    const [name, host, port = "443"] = line.split(",").map((part) => part.trim());
    return { name, host, port: Number(port) };
  });
}

export function OperationsPage() {
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [activeSettings, setActiveSettings] = useState<SettingsSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (initial: boolean) => {
      try {
        const response = await fetch("/api/operations", { cache: "no-store" });
        const data = await response.json() as OperationsSnapshot & { error?: string };
        if (!response.ok) throw new Error(data.error || "Failed to load operations");
        if (cancelled) return;
        setSnapshot(data);
        if (initial) setDraft(draftFromConfig(data.config));
      } catch (error) {
        if (initial && !cancelled) showToast(error instanceof Error ? error.message : "Failed to load operations", "error");
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    };

    void refresh(true);
    const interval = setInterval(() => { void refresh(false); }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [showToast]);

  const action = async (body: Record<string, unknown>, label: string): Promise<boolean> => {
    setBusy(label);
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as OperationsSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || `${label} failed`);
      setSnapshot(data);
      showToast(`${label} complete`, "success");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : `${label} failed`, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveConfig = async (section: SettingsSection) => {
    if (!draft) return;
    const body: Record<string, unknown> = section === "releases"
      ? { githubRepos: draft.githubRepos.split("\n").map((value) => value.trim()).filter(Boolean) }
      : section === "adguard"
        ? { adguardUrl: draft.adguardUrl, adguardUsername: draft.adguardUsername }
        : { tlsTargets: parseTlsTargets(draft.tlsTargets) };
    if (section === "adguard" && draft.adguardPassword.trim()) {
      body.adguardPassword = draft.adguardPassword;
    }

    setBusy("Save settings");
    try {
      const response = await fetch("/api/operations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as OperationsSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to save settings");
      setSnapshot(data);
      setDraft(draftFromConfig(data.config));
      setActiveSettings(null);
      showToast("Operations settings saved", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save settings", "error");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !snapshot) {
    return <div className="flex h-full items-center justify-center text-on-surface-variant">Loading operations…</div>;
  }
  if (!snapshot || !draft) {
    return <div className="p-8 text-error">Operations data is unavailable.</div>;
  }

  const copyableReleases = snapshot.releases.filter((release) => !release.error && release.tag !== "unknown");
  const hasPendingReleases = snapshot.releases.some((release) => !release.acknowledged && !release.error && release.tag !== "unknown");
  const sortedReleases = [...snapshot.releases].sort((a, b) => {
    const dateA = Date.parse(a.publishedAt);
    const dateB = Date.parse(b.publishedAt);
    return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0);
  });

  const openSettings = (section: SettingsSection) => {
    setDraft(draftFromConfig(snapshot.config));
    setActiveSettings(section);
  };

  const closeSettings = () => {
    if (busy !== null) return;
    setActiveSettings(null);
  };

  const copyReleasePrompt = async () => {
    const prompt = buildReleaseUpdatePrompt(snapshot.releases);
    try {
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(prompt);
          copied = true;
        }
      } catch {
        // Fall through to the insecure-origin fallback.
      }
      if (!copied) {
        // ponytail: execCommand is the only available copy path on insecure LAN origins.
        const textarea = document.createElement("textarea");
        textarea.value = prompt;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        try {
          textarea.focus();
          textarea.select();
          if (!document.execCommand("copy")) throw new Error("Copy command failed");
        } finally {
          textarea.remove();
        }
      }
      showToast("Release update prompt copied", "success");
    } catch {
      showToast("Could not copy release update prompt", "error");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-on-surface">Operations</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Recovery, changes, releases, DNS, and certificates.
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null || loading}
            onClick={() => action({ action: "refresh" }, "Refresh checks")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {busy === "Refresh checks" ? "Checking…" : `Refresh checks${snapshot.alertCount ? ` · ${snapshot.alertCount} alert${snapshot.alertCount === 1 ? "" : "s"}` : ""}`}
          </button>
        </header>


        <div className="grid gap-5 lg:grid-cols-2">

          <Card title="Deployment ledger" icon="deployed_code">
            {snapshot.deployments.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No deploy records yet. The next deploy will create one.</p>
            ) : (
              <div className="space-y-2">
                {snapshot.deployments.slice(0, 8).map((item, index) => (
                  <div key={`${item.timestamp}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-surface-container px-3 py-2 text-xs">
                    <div className="min-w-0"><div className="truncate font-medium">{item.subject || item.sha.slice(0, 8)}</div><div className="text-on-surface-variant">{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{item.sha.slice(0, 8)}</a> : item.sha.slice(0, 8)} · {item.stage}</div></div>
                    <div className="shrink-0 text-right"><div className={item.status === "success" ? "text-success" : item.status === "failed" ? "text-error" : "text-amber-400"}>{item.status}</div><div className="text-on-surface-variant">{formatDate(item.timestamp)}</div></div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Release radar" icon="new_releases" onConfigure={() => openSettings("releases")}>
            {snapshot.releases.length === 0 ? <p className="text-sm text-on-surface-variant">Run Refresh checks to load releases.</p> : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={copyableReleases.length === 0} onClick={copyReleasePrompt} className="rounded border border-outline-variant px-2 py-1 text-xs text-on-surface disabled:opacity-50">Copy agent prompt</button>
                  <button type="button" disabled={busy !== null || !hasPendingReleases} onClick={() => action({ action: "ack-all-releases" }, "Acknowledge all releases")} className="rounded border border-outline-variant px-2 py-1 text-xs text-on-surface disabled:opacity-50">Acknowledge all</button>
                </div>
                <div className="space-y-2">
                  {sortedReleases.map((release) => (
                    <div key={release.repo} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container px-3 py-2 text-xs">
                      <div className="min-w-0"><a className="truncate font-medium text-primary hover:underline" href={release.url} target="_blank" rel="noreferrer">{release.repo}</a><div className="text-on-surface-variant">{release.tag} · {formatDate(release.publishedAt)}</div>{release.error && <div className="text-error">{release.error}</div>}</div>
                      {!release.acknowledged && !release.error && release.tag !== "unknown" ? <button type="button" disabled={busy !== null} onClick={() => action({ action: "ack-release", repo: release.repo, tag: release.tag }, "Acknowledge release")} className="shrink-0 rounded border border-outline-variant px-2 py-1">Acknowledge</button> : <span className="shrink-0 text-success">{release.acknowledged ? "Seen" : "—"}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title="AdGuard DNS" icon="dns" onConfigure={() => openSettings("adguard")}>
            {!snapshot.adguard.configured ? <p className="text-sm text-on-surface-variant">Configure AdGuard to enable this check.</p> : (
              <>
                <div className={`mb-3 text-sm font-semibold ${statusClass(snapshot.adguard.ok && snapshot.adguard.protectionEnabled !== false)}`}>
                  {!snapshot.adguard.ok ? "Unreachable" : snapshot.adguard.protectionEnabled ? "Protection enabled" : "Protection disabled"}
                </div>
                {snapshot.adguard.error && <p className="text-xs text-error">{snapshot.adguard.error}</p>}
                {snapshot.adguard.ok && <div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-on-surface-variant">Queries</div>{snapshot.adguard.dnsQueries?.toLocaleString() ?? "—"}</div><div><div className="text-xs text-on-surface-variant">Blocked</div>{snapshot.adguard.blockedPercent?.toFixed(1) ?? "—"}%</div><div><div className="text-xs text-on-surface-variant">Average latency</div>{snapshot.adguard.averageProcessingMs?.toFixed(1) ?? "—"} ms</div><div><div className="text-xs text-on-surface-variant">Top clients</div>{snapshot.adguard.topClients?.join(", ") || "—"}</div></div>}
              </>
            )}
          </Card>

          <Card title="TLS certificates" icon="verified_user" onConfigure={() => openSettings("tls")}>
            {snapshot.config.tlsTargets.length === 0 ? <p className="text-sm text-on-surface-variant">Configure TLS targets to enable expiry checks.</p> : snapshot.tls.length === 0 ? <p className="text-sm text-on-surface-variant">Run Refresh checks to inspect certificates.</p> : (
              <div className="space-y-2">
                {snapshot.tls.map((item) => {
                  const healthy = item.ok && item.authorized && (item.daysRemaining ?? -1) > 30;
                  return <div key={`${item.host}:${item.port}`} className="flex justify-between gap-3 rounded-lg bg-surface-container px-3 py-2 text-xs"><div><div className="font-medium">{item.name}</div><div className="text-on-surface-variant">{item.host}:{item.port} · {item.issuer ?? "Unknown issuer"}</div>{item.error && <div className="text-error">{item.error}</div>}</div><div className={`shrink-0 text-right ${statusClass(healthy)}`}><div>{item.daysRemaining === undefined ? "Check failed" : `${item.daysRemaining} days`}</div><div className="text-on-surface-variant">{formatDate(item.expiresAt)}</div></div></div>;
                })}
              </div>
            )}
          </Card>

        </div>

        {activeSettings && (
          <Modal
            key={activeSettings}
            open
            onClose={busy === null ? closeSettings : () => {}}
            title={`${SETTINGS_META[activeSettings].title} settings`}
            icon={SETTINGS_META[activeSettings].icon}
            actions={(
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={closeSettings}
                  className="rounded-lg border border-outline-variant px-4 py-2 text-sm text-on-surface disabled:opacity-50"
                >
                  Cancel
                </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => { void saveConfig(activeSettings); }}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
                  >
                    {busy === "Save settings" ? "Saving…" : CONFIG_SAVE_LABELS[activeSettings]}
                  </button>
              </>
            )}
          >

            {activeSettings === "releases" && (
              <label className="text-xs text-on-surface-variant">
                GitHub repositories (owner/repo, one per line)
                <textarea aria-label="GitHub repositories" rows={7} value={draft.githubRepos} onChange={(event) => setDraft({ ...draft, githubRepos: event.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-on-surface" />
              </label>
            )}

            {activeSettings === "adguard" && (
              <div className="grid gap-4">
                <label className="text-xs text-on-surface-variant">
                  AdGuard URL
                  <input aria-label="AdGuard URL" placeholder="http://192.168.1.x:3000" value={draft.adguardUrl} onChange={(event) => setDraft({ ...draft, adguardUrl: event.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface" />
                </label>
                <label className="text-xs text-on-surface-variant">
                  AdGuard username
                  <input aria-label="AdGuard username" value={draft.adguardUsername} onChange={(event) => setDraft({ ...draft, adguardUsername: event.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface" />
                </label>
                <label className="text-xs text-on-surface-variant">
                  AdGuard password
                  <input aria-label="AdGuard password" type="password" placeholder={snapshot.config.hasAdguardPassword ? "Stored — leave blank to keep" : ""} value={draft.adguardPassword} onChange={(event) => setDraft({ ...draft, adguardPassword: event.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface" />
                </label>
              </div>
            )}

            {activeSettings === "tls" && (
              <label className="text-xs text-on-surface-variant">
                TLS targets (name,host,port)
                <textarea aria-label="TLS targets" rows={7} value={draft.tlsTargets} onChange={(event) => setDraft({ ...draft, tlsTargets: event.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-on-surface" />
              </label>
            )}

          </Modal>
        )}
      </div>
    </div>
  );
}
