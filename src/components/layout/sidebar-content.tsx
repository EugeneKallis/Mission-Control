"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NavItem } from "./nav-item";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { NAV_ENTRIES, NAV_BY_KEY, defaultSidebarLayout, type SidebarLayout, type NavBadgeKey } from "@/lib/nav-registry";
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
  const [sidebarLayout, setSidebarLayout] = useState<SidebarLayout | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean> | null>(null);
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
  // Load the user's page organization; the built-in layout remains the safe fallback.
  useEffect(() => {
    fetch("/api/sidebar/layout")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (data && typeof data === "object" && Array.isArray((data as SidebarLayout).groups)) {
          setSidebarLayout(data as SidebarLayout);
          setCollapsedGroups(Object.fromEntries((data as SidebarLayout).groups.map((group) => [group.id, group.defaultCollapsed])));
        }
      })
      .catch(() => { /* keep default layout */ });
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

  const layout = sidebarLayout ?? defaultSidebarLayout();
  const badgeCounts: Record<NavBadgeKey, number | null> = {
    pve: pveAlertCount,
    operations: operationsAlertCount,
    logs: logErrorCount,
    "bl-finder": brokenCount,
    energy: energyBetterCount,
  };
  const badgeSuppress: Record<NavBadgeKey, string> = {
    pve: "pve",
    operations: "",
    logs: "logs",
    "bl-finder": "blfinder",
    energy: "energy",
  };
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => prev ? { ...prev, [groupId]: !prev[groupId] } : prev);
  };
  const renderEntry = (key: string) => {
    const entry = NAV_BY_KEY[key];
    if (!entry) return null;
    const badge = entry.badge;
    const count = badge ? badgeCounts[badge] : null;
    const suppressed = badge ? suppressedSources.includes(badgeSuppress[badge]) : false;
    return (
      <NavItem
        key={entry.key}
        label={entry.label}
        icon={entry.icon}
        href={entry.href}
        color={entry.color}
        badge={suppressed ? undefined : count ?? undefined}
        {...(entry.badgeTitle ? { badgeTitle: entry.badgeTitle } : {})}
      />
    );
  };

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
        {layout.groups.map((group) => {
          if (group.items.length === 0) return null;
          if (group.id === "ungrouped") {
            return <div key={group.id}><div className="my-3 mx-5 h-px bg-outline-variant/30" />{group.items.map(renderEntry)}</div>;
          }
          const collapsed = collapsedGroups?.[group.id] ?? group.defaultCollapsed;
          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center gap-3 px-5 py-2 text-on-surface hover:bg-surface-container/60 transition-colors mx-2 rounded-[var(--radius-button)]"
                aria-expanded={!collapsed}
              >
                <span className="flex-1 text-left text-sm font-semibold">{group.name}</span>
                <span
                  className="material-symbols-outlined text-on-surface-variant text-base transition-transform duration-200"
                  style={{ transform: collapsed ? undefined : "rotate(90deg)" }}
                  aria-hidden="true"
                >
                  expand_more
                </span>
              </button>
              {!collapsed && <div className="pl-1">{group.items.map(renderEntry)}</div>}
            </div>
          );
        })}
        <div className="my-3 mx-5 h-px bg-outline-variant/30" />
        {NAV_ENTRIES.filter((entry) => entry.fixed).map((entry) => (
          <NavItem key={entry.key} label={entry.label} icon={entry.icon} href={entry.href} color={entry.color} />
        ))}
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
