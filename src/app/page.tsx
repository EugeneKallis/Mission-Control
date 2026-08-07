"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useToast } from "@/components/toast-provider";
import type { GroupWithMacros, Macro } from "@/types";

// ── Macro Right Rail (rendered inside AppShell's right-rail slot) ─────────

function MacroRightRail({ macros }: { macros: GroupWithMacros[] }) {
  const handleClick = useCallback((macro: Macro) => {
    // Home page is already mounted, so dispatch the in-app event
    // rather than the deep-link URL. runMacro on Home will pick it up.
    window.dispatchEvent(
      new CustomEvent("macro:run", {
        detail: { macroId: macro.id },
      }),
    );
  }, []);

  if (macros.length === 0) {
    return (
      <div className="px-4 py-8 text-[11px] text-on-surface-variant/60 italic text-center">
        No macros configured.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {macros.map((group) => (
        <div key={group.group?.id ?? "__ungrouped__"} className="mb-1">
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 font-display">
            {group.group?.name ?? "Ungrouped"}
          </div>
          {group.macros.map((macro) => (
            <button
              key={macro.id}
              onClick={() => handleClick(macro)}
              className="w-full text-left px-5 py-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60 transition-colors flex items-center gap-2"
              title={macro.description || macro.name}
            >
              <span className="material-symbols-outlined text-sm text-primary/60">
                terminal
              </span>
              <span className="truncate">{macro.name}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Home Page / Command Center ───────────────────────────────────────────

export default function Home() {

  const { lines, isConnected, clearLines, containerRef, handleScroll } =
    useLiveStream();
  const toast = useToast();

  // Right-rail macros
  const [groupedMacros, setGroupedMacros] = useState<GroupWithMacros[]>([]);

  useEffect(() => {
    fetch("/api/macros")
      .then((r) => r.json())
      .then(setGroupedMacros)
      .catch(() => {});
  }, []);

  // ── Run macro ──────────────────────────────────────────────────────

  const runMacro = useCallback(
    (macroId: number) => {
      fetch(`/api/run/${macroId}`, { method: "POST" }).catch(() => {});
      toast?.showToast("Running macro\u2026", "info");
    },
    [toast],
  );

  // ── In-app macro trigger (sidebar, right rail) ────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ macroId: number }>).detail;
      runMacro(detail.macroId);
    };
    window.addEventListener("macro:run", handler);
    return () => window.removeEventListener("macro:run", handler);
  }, [runMacro]);

  // ── Deep link ──────────────────────────────────────────────────────

  const deepLinkRan = useRef(false);
  useEffect(() => {
    if (deepLinkRan.current || !isConnected) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("run_macro");
    if (id) {
      // Keep the deep link until the SSE terminal has connected, then claim
      // and run it exactly once so the first command output is observable.
      deepLinkRan.current = true;
      runMacro(Number(id));
      const url = new URL(window.location.href);
      url.searchParams.delete("run_macro");
      window.history.replaceState({}, "", url.toString());
    }
  }, [isConnected, runMacro]);

  // ── Clear & Export ─────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    clearLines();
    toast?.showToast("Buffer cleared", "info");
  }, [clearLines, toast]);

  const handleExport = useCallback(() => {
    const blob = new Blob([lines.join("")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mission-control-log-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast?.showToast("Logs exported", "info");
  }, [lines, toast]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <AppShell noScroll showRightRail rightRailSlot={<MacroRightRail macros={groupedMacros} />}>
        <div className="flex-1 flex flex-col min-h-0 stagger-1">
          {/* ── Command Center Bar ───────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-2 shrink-0 bg-surface border-b border-outline-variant/30">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-button)] bg-primary/15 text-primary">
                <span className="material-symbols-outlined text-lg">terminal</span>
              </div>
              <div>
                <span className="text-sm font-bold text-on-surface font-display tracking-tight">Command Center</span>
                <span className="text-[10px] text-on-surface-variant ml-2 font-mono hidden sm:inline">mctl-local</span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-button)] bg-surface-container/60">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-primary" : "bg-error"}`} />
                <span className="text-[10px] text-on-surface-variant font-mono">{isConnected ? "LIVE" : "OFFLINE"}</span>
              </div>
            </div>
          </div>

          {/* ── Terminal Output ────────────────────────────────────── */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 p-5 font-mono text-sm leading-relaxed overflow-y-auto min-h-0 min-w-0 terminal-scanline terminal-glow"
            style={{ background: "var(--terminal-bg)", color: "var(--terminal-fg)" }}
            tabIndex={0}
          >
            {lines.length === 0 ? (
              <div className="text-on-surface-variant italic flex flex-col gap-1.5">
                <span className="text-on-surface-variant">Mission Control v0.1.0 &mdash; Terminal ready.</span>
                <span className="text-on-surface-variant/80">
                  Select a macro from the sidebar or right rail to start.
                </span>
              </div>
            ) : (
              lines.map((line, i) => (
                <div
                  key={i}
                  className="whitespace-pre-wrap break-words"
                  style={{ animation: "fade-up 0.12s ease-out both" }}
                >
                  {line}
                </div>
              ))
            )}
          </div>

          {/* ── Terminal Footer ─────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 bg-surface border-t border-outline-variant/30">
            <button
              onClick={handleClear}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded-[var(--radius-button)] min-h-[36px]"
            >
              <span className="material-symbols-outlined text-base">delete</span>
              Clear
            </button>
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded-[var(--radius-button)] min-h-[36px]"
            >
              <span className="material-symbols-outlined text-base">download</span>
              Export
            </button>
          </div>
        </div>
      </AppShell>
    </>
  );
}
