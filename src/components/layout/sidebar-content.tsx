"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NavItem } from "./nav-item";
import type { GroupWithMacros, Macro } from "@/types";

interface SidebarContentProps {
  brand?: string;
  version?: string;
  uptime?: string;
  macrosCollapsed?: boolean;
}

/**
 * Run a macro. If the user is already on the home page (where the
 * terminal stream lives), dispatch the in-app event so the home
 * page's listener picks it up. Otherwise navigate to the home page
 * with a deep-link query that the home page will execute on mount.
 */
function runMacroFromSidebar(macro: Macro, pathname: string, push: (href: string) => void) {
  const agent = macro.agentHostname || undefined;
  if (pathname === "/") {
    window.dispatchEvent(
      new CustomEvent("macro:run", {
        detail: { macroId: macro.id, agent },
      }),
    );
    return;
  }
  const search = new URLSearchParams({ run_macro: String(macro.id) });
  if (agent) search.set("agent", agent);
  push(`/?${search.toString()}`);
}

export function SidebarContent({
  brand = "Mission Control",
  version = "0.1.0",
  uptime,
  macrosCollapsed = true,
}: SidebarContentProps) {
  const [rdStatus, setRdStatus] = useState<{ label: string; ok: boolean } | null>(null);
  const [groupedMacros, setGroupedMacros] = useState<GroupWithMacros[]>([]);
  const [macrosLoading, setMacrosLoading] = useState(true);
  const [brokenCount, setBrokenCount] = useState<number | null>(null);
  const [logErrorCount, setLogErrorCount] = useState<number | null>(null);
  const [energyBetterCount, setEnergyBetterCount] = useState<number | null>(null);
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

  // Poll the Log Viewer error-alert count so the nav badge stays fresh.
  // 60s interval + visibilitychange matches the BL Finder pattern.
  useEffect(() => {
    let cancelled = false;
    const fetchLogAlerts = () => {
      fetch("/api/logs/alerts")
        .then((r) => r.json())
        .then((data: { total?: number }) => {
          if (cancelled) return;
          if (typeof data.total === "number") setLogErrorCount(data.total);
        })
        .catch(() => { /* leave previous value */ });
    };
    fetchLogAlerts();
    const interval = setInterval(fetchLogAlerts, 60_000);
    const onVis = () => { if (!document.hidden) fetchLogAlerts(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const handleMacroClick = useCallback((macro: Macro) => {
    if (macro.runOnAgent && !macro.agentHostname) {
      // Open agent modal via AppShell listener
      window.dispatchEvent(
        new CustomEvent("macro:run-agent", {
          detail: { macroId: macro.id, macroName: macro.name },
        }),
      );
    } else {
      runMacroFromSidebar(macro, pathname, router.push);
    }
  }, [pathname, router]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Brand header */}
      <div
        className="h-14 flex items-center justify-between px-5 shrink-0"
        style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
      >
        <Link
          href="/"
          className="text-lg font-bold text-primary font-display hover:opacity-80 transition-opacity"
          aria-label="Go to home"
        >
          {brand}
        </Link>
        <div className="text-[11px] text-on-surface-variant text-right leading-tight">
          <div>v{version}</div>
          {uptime && <div>{uptime}</div>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {/* Macros section (collapsible) */}
        <details open={!macrosCollapsed} className="group">
          <summary className="list-none cursor-pointer outline-none">
            <div className="flex items-center gap-3 px-5 py-2 text-on-surface hover:bg-surface-container-high transition-colors mx-2">
              <span className="material-symbols-outlined text-green-500 text-xl">
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
                      className="w-full text-left pl-7 pr-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-2"
                      title={macro.description || macro.name}
                    >
                      <span className="material-symbols-outlined text-sm text-primary/60">
                        {macro.runOnAgent ? "dns" : "terminal"}
                      </span>
                      <span className="truncate">{macro.name}</span>
                      {macro.runOnAgent && (
                        <span className="text-[9px] text-primary/40 font-mono ml-auto shrink-0">
                          AGENT
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </details>

        <div className="my-3 mx-4 h-px" style={{ background: "rgba(59, 75, 63, 0.4)" }} />

        <NavItem
          label="Energy Prices"
          icon="bolt"
          href="/energy-prices"
          color="lime"
          badge={energyBetterCount ?? undefined}
          badgeTitle="better rates"
        />

        {/* Agent section */}
        <div className="my-2 mx-5 mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
            Agent
          </span>
        </div>
        <NavItem label="Pi Agent" icon="smart_toy" href="/chat" color="primary" />
        <NavItem label="Pi Settings" icon="settings" href="/pi-settings" color="primary" />
        <NavItem label="Scheduled Tasks" icon="schedule_send" href="/agent-tasks" color="primary" />

        {/* Divider */}
        <div className="my-3 mx-4 h-px" style={{ background: "rgba(59, 75, 63, 0.4)" }} />

        {/* Nav items — exact matches from original */}
        <NavItem label="History" icon="history" href="/history" color="amber" />
        <NavItem label="Schedules" icon="schedule" href="/schedules" color="cyan" />
        <NavItem label="NZB Viewer" icon="folder_open" href="/nzb" color="teal" />
        <NavItem label="Debrid Viewer" icon="cloud" href="/debrid" color="teal" />

        {/* Divider */}
        <div className="my-3 mx-4 h-px" style={{ background: "rgba(59, 75, 63, 0.4)" }} />

        <NavItem label="Server Status" icon="dns" href="/status" color="green" />
        <NavItem
          label="Log Viewer"
          icon="terminal"
          href="/logs"
          color="primary"
          badge={logErrorCount ?? undefined}
          badgeTitle="errors"
        />
        <NavItem label="Database" icon="table_chart" href="/database" color="violet" />
        <NavItem
          label="BL Finder"
          icon="broken_image"
          href="/database/bl-finder"
          color="amber"
          badge={brokenCount ?? undefined}
        />

        {/* Divider */}
        <div className="my-3 mx-4 h-px" style={{ background: "rgba(59, 75, 63, 0.4)" }} />

        <NavItem label="Admin" icon="admin_panel_settings" href="/admin" color="violet" />
        <NavItem label="Config" icon="settings" href="/admin/config" color="violet" />
        <NavItem label="Scraper" icon="download" href="/scraper" color="rose" />
      </nav>

      {/* Real-Debrid status badge */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(59, 75, 63, 0.3)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`material-symbols-outlined text-sm ${
                rdStatus?.ok ? "text-primary" : "text-error"
              }`}
            >
              bolt
            </span>
            <span className="text-on-surface-variant">RD</span>
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
