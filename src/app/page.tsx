"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useToast } from "@/components/toast-provider";
import { NAV_BY_KEY, NAV_ENTRIES, defaultSidebarLayout, type SidebarLayout } from "@/lib/nav-registry";
import type { GroupWithMacros, Macro } from "@/types";

type ActiveView = "dashboard" | "terminal";

const tabIds: Record<ActiveView, string> = { dashboard: "home-tab-dashboard", terminal: "home-tab-terminal" };
const panelIds: Record<ActiveView, string> = { dashboard: "home-panel-dashboard", terminal: "home-panel-terminal" };

function cardClass() {
  return "group flex min-h-11 min-w-0 items-center gap-3 rounded-[var(--radius-card)] border border-outline-variant/40 bg-surface-container/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-container active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
}

function MacroCard({ macro, onRun }: { macro: Macro; onRun: (id: number) => void }) {
  return (
    <button type="button" onClick={() => onRun(macro.id)} className={`${cardClass()} w-full`}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-lg">terminal</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-on-surface">{macro.name}</span>
        {macro.description && <span className="mt-0.5 block truncate text-xs text-on-surface-variant">{macro.description}</span>}
      </span>
      <span className="material-symbols-outlined shrink-0 text-lg text-primary/70">play_arrow</span>
    </button>
  );
}

function PageCard({ entry }: { entry: (typeof NAV_ENTRIES)[number] }) {
  return (
    <Link href={entry.href} className={cardClass()}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-lg">{entry.icon}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{entry.label}</span>
      <span className="material-symbols-outlined shrink-0 text-lg text-primary/70">arrow_forward</span>
    </Link>
  );
}

export default function Home() {
  const { lines, isConnected, clearLines, containerRef, handleScroll, setIsAutoScroll } = useLiveStream();
  const toast = useToast();
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [groupedMacros, setGroupedMacros] = useState<GroupWithMacros[]>([]);
  const [macroLoading, setMacroLoading] = useState(true);
  const [macroError, setMacroError] = useState(false);
  const [layout, setLayout] = useState<SidebarLayout>(() => defaultSidebarLayout());
  const tabRefs = useRef<Record<ActiveView, HTMLButtonElement | null>>({ dashboard: null, terminal: null });

  const loadMacros = useCallback(async () => {
    setMacroLoading(true);
    setMacroError(false);
    try {
      const response = await fetch("/api/macros");
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error("Invalid macro response");
      setGroupedMacros(data as GroupWithMacros[]);
    } catch {
      setMacroError(true);
    } finally {
      setMacroLoading(false);
    }
  }, []);

  useEffect(() => { void loadMacros(); }, [loadMacros]);

  useEffect(() => {
    fetch("/api/sidebar/layout")
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok || typeof data !== "object" || data === null || !Array.isArray((data as SidebarLayout).groups) || !Array.isArray((data as SidebarLayout).hidden)) return;
        setLayout(data as SidebarLayout);
      })
      .catch(() => {});
  }, []);

  const runMacro = useCallback((macroId: number) => {
    setActiveView("terminal");
    fetch(`/api/run/${macroId}`, { method: "POST" }).catch(() => {});
    toast?.showToast("Running macro…", "info");
  }, [toast]);

  useEffect(() => {
    const handler = (event: Event) => runMacro((event as CustomEvent<{ macroId: number }>).detail.macroId);
    window.addEventListener("macro:run", handler);
    return () => window.removeEventListener("macro:run", handler);
  }, [runMacro]);
  const deepLinkRan = useRef(false);

  useEffect(() => {
    if (deepLinkRan.current || !isConnected) return;
    const id = new URLSearchParams(window.location.search).get("run_macro");
    if (!id) return;
    deepLinkRan.current = true;
    runMacro(Number(id));
    const url = new URL(window.location.href);
    url.searchParams.delete("run_macro");
    window.history.replaceState({}, "", url.toString());
  }, [isConnected, runMacro]);

  useEffect(() => { if (activeView === "terminal") setIsAutoScroll(true); }, [activeView, setIsAutoScroll]);

  const selectView = useCallback((view: ActiveView, focus = false) => {
    setActiveView(view);
    if (focus) requestAnimationFrame(() => tabRefs.current[view]?.focus());
  }, []);
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, current: ActiveView) => {
    const order: ActiveView[] = ["dashboard", "terminal"];
    let index = order.indexOf(current);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") index = (index + 1) % order.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") index = (index + order.length - 1) % order.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = order.length - 1;
    else return;
    event.preventDefault();
    selectView(order[index], true);
  };

  const handleClear = useCallback(() => { clearLines(); toast?.showToast("Buffer cleared", "info"); }, [clearLines, toast]);
  const handleExport = useCallback(() => {
    const url = URL.createObjectURL(new Blob([lines.join("")], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `mission-control-log-${Date.now()}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast?.showToast("Logs exported", "info");
  }, [lines, toast]);

  const groupedPages = layout.groups.map((group) => ({ ...group, entries: group.items.map((key) => NAV_BY_KEY[key]).filter((entry): entry is (typeof NAV_ENTRIES)[number] => Boolean(entry) && !entry.fixed) })).filter((group) => group.entries.length > 0);
  const hiddenPages = layout.hidden.map((key) => NAV_BY_KEY[key]).filter((entry): entry is (typeof NAV_ENTRIES)[number] => Boolean(entry) && !entry.fixed);
  const fixedPages = NAV_ENTRIES.filter((entry) => entry.fixed);
  const hasMacros = groupedMacros.some((group) => group.macros.length > 0);

  return (
    <AppShell noScroll>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-outline-variant/30 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:px-6">
          <div><h1 className="font-display text-xl font-semibold text-on-surface">Dashboard</h1><p className="mt-1 text-xs text-on-surface-variant">Quick access to macros and Mission Control pages.</p></div>
          <div role="tablist" aria-label="Home views" className="mt-4 grid w-full grid-cols-2 rounded-[var(--radius-button)] bg-surface-container p-1 sm:mt-0 sm:w-auto sm:min-w-56">
            {(["dashboard", "terminal"] as ActiveView[]).map((view) => (
              <button key={view} ref={(node) => { tabRefs.current[view] = node; }} id={tabIds[view]} type="button" role="tab" aria-selected={activeView === view} aria-controls={panelIds[view]} tabIndex={activeView === view ? 0 : -1} onClick={() => selectView(view)} onKeyDown={(event) => moveTab(event, view)} className={`min-h-11 rounded-[var(--radius-button)] px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeView === view ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}>{view === "dashboard" ? "Dashboard" : "Terminal"}</button>
            ))}
          </div>
        </header>

        <section id={panelIds.dashboard} role="tabpanel" aria-labelledby={tabIds.dashboard} hidden={activeView !== "dashboard"} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-7xl space-y-8">
            <section><h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-on-surface-variant">Macros</h2>{macroLoading ? <div className="text-xs text-on-surface-variant">Loading macros…</div> : macroError ? <div className="flex items-center gap-3 text-xs text-error">Unable to load macros.<Button type="button" onClick={() => void loadMacros()}>Retry</Button></div> : !hasMacros ? <EmptyState icon="terminal" message="No macros configured." /> : <div className="space-y-5">{groupedMacros.filter((group) => group.macros.length > 0).map((group) => <div key={group.group?.id ?? "ungrouped"}><h3 className="mb-2 text-xs font-semibold text-on-surface-variant">{group.group?.name ?? "Ungrouped"}</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.macros.map((macro) => <MacroCard key={macro.id} macro={macro} onRun={runMacro} />)}</div></div>)}</div>}</section>
            <section><h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-on-surface-variant">Pages</h2><div className="space-y-6">{groupedPages.map((group) => <div key={group.id}><h3 className="mb-2 text-xs font-semibold text-on-surface-variant">{group.name}</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{group.entries.map((entry) => <PageCard key={entry.key} entry={entry} />)}</div></div>)}{hiddenPages.length > 0 && <div><h3 className="mb-2 text-xs font-semibold text-on-surface-variant">More pages</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{hiddenPages.map((entry) => <PageCard key={entry.key} entry={entry} />)}</div></div>}<div><h3 className="mb-2 text-xs font-semibold text-on-surface-variant">Manage</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{fixedPages.map((entry) => <PageCard key={entry.key} entry={entry} />)}</div></div></div></section>
          </div>
        </section>

        <section id={panelIds.terminal} role="tabpanel" aria-labelledby={tabIds.terminal} hidden={activeView !== "terminal"} className="min-h-0 flex-1 flex-col">
          <div ref={containerRef} onScroll={handleScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5 font-mono text-sm leading-relaxed terminal-scanline terminal-glow" style={{ background: "var(--terminal-bg)", color: "var(--terminal-fg)" }} tabIndex={0}>
            {lines.length === 0 ? <div className="flex flex-col gap-1.5 text-on-surface-variant italic"><span>Mission Control v0.1.0 — Terminal ready.</span><span className="text-on-surface-variant/80">Select a macro from the Dashboard or sidebar to start.</span></div> : lines.map((line, i) => <div key={i} className="whitespace-pre-wrap break-words" style={{ animation: "fade-up 0.12s ease-out both" }}>{line}</div>)}
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t border-outline-variant/30 bg-surface px-4 py-2.5"><button onClick={handleClear} className="flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-button)] px-3 py-2 text-xs font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"><span className="material-symbols-outlined text-base">delete</span>Clear</button><button onClick={handleExport} className="flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-button)] px-3 py-2 text-xs font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"><span className="material-symbols-outlined text-base">download</span>Export</button></div>
        </section>
      </div>
    </AppShell>
  );
}
