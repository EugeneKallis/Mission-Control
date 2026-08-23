"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NavItem } from "./nav-item";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import type { GroupWithMacros, Macro } from "@/types";

interface SidebarContentProps {
  brand?: string;
  version?: string;
  uptime?: string;
  macrosCollapsed?: boolean;
  onClose?: () => void;
}

/**
 * Run a macro. If the user is already on the home page (where the
 * terminal stream lives), dispatch the in-app event so the home
 * page's listener picks it up. Otherwise navigate to the home page
 * with a deep-link query that the home page will execute on mount.
 */
function runMacroFromSidebar(macro: Macro, pathname: string, push: (href: string) => void) {
  if (pathname === "/") {
    window.dispatchEvent(
      new CustomEvent("macro:run", {
        detail: { macroId: macro.id },
      }),
    );
    return;
  }
  push(`/?run_macro=${macro.id}`);
}

export function SidebarContent({
  brand = "Mission Control",
  version = "0.1.0",
  uptime,
  macrosCollapsed = true,
  onClose,
}: SidebarContentProps) {
  const [rdStatus, setRdStatus] = useState<{ label: string; ok: boolean } | null>(null);
  const [groupedMacros, setGroupedMacros] = useState<GroupWithMacros[]>([]);
  const [macrosLoading, setMacrosLoading] = useState(true);
  const [brokenCount, setBrokenCount] = useState<number | null>(null);
  const [logErrorCount, setLogErrorCount] = useState<number | null>(null);
  const [energyBetterCount, setEnergyBetterCount] = useState<number | null>(null);
  const [pveAlertCount, setPveAlertCount] = useState<number | null>(null);
  const [operationsAlertCount, setOperationsAlertCount] = useState<number | null>(null);
  const [suppressedSources, setSuppressedSources] = useState<string[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  // Fetch Real-Debrid status
  useEffect(() => {
    fetch("/api/real-debrid/status")
      .then((r) => r.json())
      .then((data) => setRdStatus(data))
      .catch(() => setRdStatus({ label: "Offline", ok: false }));
  }, []);

  // Fetch sidebar macros
  useEffect(() => {
    fetch("/api/macros")
      .then((r) => r.json())
      .then((data) => {
        setGroupedMacros(data);
        setMacrosLoading(false);
      })
      .catch(() => {
        setMacrosLoading(false);
      });
  }, []);

  // Poll the BL Finder broken count so the nav badge stays fresh.
  // 60s matches the uptime poll; we also re-fetch on tab focus so a
  // backgrounded tab picks up new broken rows quickly when reopened.
  useEffect(() => {
    let cancelled = false;
    const fetchBroken = () => {
      fetch("/api/bl-finder/counts")
        .then((r) => r.json())
        .then((data: { broken?: number }) => {
          if (cancelled) return;
          if (typeof data.broken === "number") setBrokenCount(data.broken);
        })
        .catch(() => { /* leave previous value */ });
    };
    fetchBroken();
    const interval = setInterval(fetchBroken, 60_000);
    const onVis = () => { if (!document.hidden) fetchBroken(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Poll the energy-prices better-offer count so the nav badge stays fresh.
  // Only polls when the user has set a target rate (otherwise no badge to show).
  useEffect(() => {
    let cancelled = false;
    const fetchEnergy = () => {
      fetch("/api/energy-prices")
        .then((r) => r.json())
        .then((data: { targetRate?: number | null; betterCount?: number }) => {
          if (cancelled) return;
          if (data.targetRate != null && typeof data.betterCount === "number") {
            setEnergyBetterCount(data.betterCount);
          }
        })
        .catch(() => { /* leave previous value */ });
    };
    fetchEnergy();
    const interval = setInterval(fetchEnergy, 60_000);
    const onVis = () => { if (!document.hidden) fetchEnergy(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Poll the PVE alert count so the nav badge stays fresh.
  // GET /api/pve/alerts uses the same cached snapshot as the dashboard,
  // but the cached snapshot itself is only valid for 15s; the sidebar may
  // trigger a fresh Proxmox API call if the cache has expired.
  useEffect(() => {
    let cancelled = false;
    const fetchPveAlerts = () => {
      fetch("/api/pve/alerts")
        .then((r) => r.json())
        .then((data: { count?: number }) => {
          if (cancelled) return;
          if (typeof data.count === "number") setPveAlertCount(data.count);
        })
        .catch(() => { /* leave previous value */ });
    };
    fetchPveAlerts();
    const interval = setInterval(fetchPveAlerts, 60_000);
    const onVis = () => { if (!document.hidden) fetchPveAlerts(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Poll the Log Viewer error-alert count so the nav badge stays fresh.
  // 60s interval + visibilitychange matches the BL Finder pattern.
  const alertGenRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const fetchLogAlerts = () => {
      const gen = alertGenRef.current;
      fetch("/api/logs/alerts")
        .then((r) => r.json())
        .then((data: { total?: number }) => {
          if (cancelled || gen !== alertGenRef.current) return;
          if (typeof data.total === "number") setLogErrorCount(data.total);
        })
        .catch(() => { /* leave previous value */ });
    };
    fetchLogAlerts();
    const interval = setInterval(fetchLogAlerts, 60_000);
    const onVis = () => { if (!document.hidden) fetchLogAlerts(); };
    document.addEventListener("visibilitychange", onVis);
    const onAck = () => {
      alertGenRef.current += 1;
      setLogErrorCount(0);
    };
    window.addEventListener("log-alerts:acknowledged", onAck);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("log-alerts:acknowledged", onAck);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOperations = () => {
      fetch("/api/operations")
        .then((response) => response.json())
        .then((data: { alertCount?: number; activeSuppressedSources?: string[] }) => {
          if (cancelled) return;
          if (typeof data.alertCount === "number") setOperationsAlertCount(data.alertCount);
          if (Array.isArray(data.activeSuppressedSources)) setSuppressedSources(data.activeSuppressedSources);
        })
        .catch(() => { /* leave previous value */ });
    };
    fetchOperations();
    const interval = setInterval(fetchOperations, 60_000);
    const onVis = () => { if (!document.hidden) fetchOperations(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const handleMacroClick = useCallback((macro: Macro) => {
    runMacroFromSidebar(macro, pathname, router.push);
  }, [pathname, router]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Brand header */}
      <div className="h-14 flex items-center justify-between px-5 shrink-0 border-b border-outline-variant/30">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-lg font-bold text-primary font-display tracking-tight hover:opacity-80 transition-opacity"
          aria-label="Go to home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mission-control-icon.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-lg"
          />
          {brand}
        </Link>
        <div className="flex items-center gap-1">
          <div className="text-[11px] text-on-surface-variant text-right leading-tight">
            <div className="font-medium">v{version}</div>
            {uptime && <div className="text-[10px]">{uptime}</div>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-[var(--radius-button)] text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {/* Macros section (collapsible) */}
        <details open={!macrosCollapsed} className="group">
          <summary className="list-none cursor-pointer outline-none">
            <div className="flex items-center gap-3 px-5 py-2 text-on-surface hover:bg-surface-container/60 transition-colors mx-2 rounded-[var(--radius-button)]">
              <span className="material-symbols-outlined text-primary text-xl">
                terminal
              </span>
              <span className="flex-1 text-sm font-semibold">Macros</span>
              <span className="material-symbols-outlined text-on-surface-variant text-base transition-transform duration-200 expand-icon">
                expand_more
              </span>
            </div>
          </summary>
          <div className="pl-1">
            {macrosLoading ? (
              <div className="px-5 py-3 text-[11px] text-on-surface-variant/60 italic">
                Loading…
              </div>
            ) : groupedMacros.length === 0 ? (
              <div className="px-5 py-4 text-[11px] text-on-surface-variant italic">
                No macros configured.
              </div>
            ) : (
              groupedMacros.map((group) => (
                <div key={group.group?.id ?? "__ungrouped__"} className="mb-1">
                  {/* Group header */}
                  <div className="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 font-display">
                    {group.group?.name ?? "Ungrouped"}
                  </div>
                  {/* Macros */}
                  {group.macros.map((macro) => (
                    <button
                      key={macro.id}
                      onClick={() => handleMacroClick(macro)}
                      className="w-full text-left pl-7 pr-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60 transition-colors flex items-center gap-2 rounded-[var(--radius-button)] mx-1"
                      title={macro.description || macro.name}
                    >
                      <span className="material-symbols-outlined text-sm text-primary/60">
                        terminal
                      </span>
                      <span className="truncate">{macro.name}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </details>

        <div className="my-3 mx-5 h-px bg-outline-variant/30" />

        {/* Agent section */}
        <div className="my-2 mx-5 mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            Agent
          </span>
        </div>
        <NavItem label="Pi Agent" icon="smart_toy" href="/chat" color="primary" />
        <NavItem label="Pi Settings" icon="settings" href="/pi-settings" color="primary" />
        <NavItem label="Scheduled Tasks" icon="schedule_send" href="/agent-tasks" color="primary" />

        {/* Activity section */}
        <div className="my-2 mx-5 mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            Activity
          </span>
        </div>
        <NavItem label="History" icon="history" href="/history" color="amber" />
        <NavItem label="Schedules" icon="schedule" href="/schedules" color="cyan" />

        {/* Monitoring section */}
        <div className="my-2 mx-5 mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            Monitoring
          </span>
        </div>
        <NavItem label="Proxmox" icon="dns" href="/pve" color="green" badge={suppressedSources.includes("pve") ? undefined : pveAlertCount ?? undefined} badgeTitle="alerts" />
        <NavItem label="Local Arrs" icon="video_library" href="/local-arrs" color="teal" />
        <NavItem label="Arr Drift" icon="difference" href="/arr-drift" color="teal" />
        <NavItem label="Pulse" icon="monitor_heart" href="/pulse" color="cyan" />
        <NavItem label="Integrations" icon="lan" href="/integrations" color="cyan" />
        <NavItem label="Operations" icon="hub" href="/operations" color="amber" badge={operationsAlertCount ?? undefined} badgeTitle="alerts" />
        <NavItem
          label="Log Viewer"
          icon="terminal"
          href="/logs"
          color="primary"
          badge={suppressedSources.includes("logs") ? undefined : logErrorCount ?? undefined}
          badgeTitle="errors"
        />
        <NavItem
          label="BL Finder"
          icon="broken_image"
          href="/database/bl-finder"
          color="amber"
          badge={suppressedSources.includes("blfinder") ? undefined : brokenCount ?? undefined}
        />
        {/* Settings section */}
        <div className="my-2 mx-5 mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            Settings
          </span>
        </div>
        <NavItem
          label="Energy Prices"
          icon="bolt"
          href="/energy-prices"
          color="lime"
          badge={suppressedSources.includes("energy") ? undefined : energyBetterCount ?? undefined}
          badgeTitle="better rates"
        />
        <NavItem label="Admin" icon="admin_panel_settings" href="/admin" color="violet" />
        <NavItem label="Config" icon="settings" href="/admin/config" color="violet" />

        {/* Archive section (collapsible, collapsed by default) */}
        <details className="group">
          <summary className="list-none cursor-pointer outline-none">
            <div className="flex items-center gap-3 px-5 py-2 text-on-surface hover:bg-surface-container/60 transition-colors mx-2 rounded-[var(--radius-button)]">
              <span className="material-symbols-outlined text-teal-500 text-xl">
                perm_media
              </span>
              <span className="flex-1 text-sm font-semibold">Archive</span>
              <span className="material-symbols-outlined text-on-surface-variant text-base transition-transform duration-200 expand-icon">
                expand_more
              </span>
            </div>
          </summary>
          <div className="pl-1">
            <NavItem label="NZB Viewer" icon="folder_open" href="/nzb" color="teal" />
            <NavItem label="Debrid Viewer" icon="cloud" href="/debrid" color="teal" />
            <NavItem label="Database" icon="table_chart" href="/database" color="violet" />
          </div>
        </details>

        {/* Scraper stays as the final navbar item. */}
        <div className="my-3 mx-5 h-px bg-outline-variant/30" />
        <NavItem label="Scraper" icon="download" href="/scraper" color="rose" />
      </nav>

      {/* Appearance — theme switcher */}
      <div className="px-4 pt-3 pb-1 shrink-0 border-t border-outline-variant/30">
        <ThemeSwitcher />
      </div>

      {/* Real-Debrid status badge */}
      <div className="px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`material-symbols-outlined text-sm ${
                rdStatus?.ok ? "text-primary" : "text-error"
              }`}
            >
              bolt
            </span>
            <span className="text-on-surface-variant">Real-Debrid</span>
          </div>
          <span
            className={`text-xs font-semibold font-mono ${
              rdStatus?.ok ? "text-primary" : "text-error"
            }`}
          >
            {rdStatus?.label ?? "Loading…"}
          </span>
        </div>
      </div>
    </div>
  );
}
