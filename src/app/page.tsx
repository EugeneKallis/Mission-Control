"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useToast } from "@/components/toast-provider";
import type { GroupWithMacros, Macro } from "@/types";

// ── Macro Right Rail (rendered inside AppShell's right-rail slot) ─────────

function MacroRightRail({ macros }: { macros: GroupWithMacros[] }) {
  const handleClick = useCallback((macro: Macro) => {
    if (macro.runOnAgent && !macro.agentHostname) {
      window.dispatchEvent(
        new CustomEvent("macro:run-agent", {
          detail: { macroId: macro.id, macroName: macro.name },
        }),
      );
    } else {
      // Home page is already mounted, so dispatch the in-app event
      // rather than the deep-link URL. runMacro on Home will pick it up.
      window.dispatchEvent(
        new CustomEvent("macro:run", {
          detail: {
            macroId: macro.id,
            agent: macro.agentHostname || undefined,
          },
        }),
      );
    }
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
              className="w-full text-left px-5 py-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-2"
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
      ))}
    </div>
  );
}

// ── Home Page / Terminal Dashboard ────────────────────────────────────────

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
    (macroId: number, agent?: string) => {
      const url = agent
        ? `/api/run/${macroId}?agent=${encodeURIComponent(agent)}`
        : `/api/run/${macroId}`;
      fetch(url, { method: "POST" }).catch(() => {});
      toast?.showToast("Running macro…", "info");
    },
    [toast],
  );

  // ── In-app macro trigger (sidebar, agent modal, right rail) ────────
  // The home page is the only place that owns the SSE terminal stream,
  // so every macro run has to be funneled through here. The sidebar
  // and agent modal navigate to "/" when not already on it; this
  // listener fires on the home page mount with the deep-link query,
  // or directly when the run originates from the right rail.

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ macroId: number; agent?: string }>).detail;
      runMacro(detail.macroId, detail.agent);
    };
    window.addEventListener("macro:run", handler);
    return () => window.removeEventListener("macro:run", handler);
  }, [runMacro]);

  // ── Deep link ──────────────────────────────────────────────────────

  const deepLinkRan = useRef(false);
  useEffect(() => {
    if (deepLinkRan.current) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("run_macro");
    const agent = params.get("agent");
    if (id) {
      deepLinkRan.current = true;
      runMacro(Number(id), agent || undefined);
      const url = new URL(window.location.href);
      url.searchParams.delete("run_macro");
      url.searchParams.delete("agent");
      window.history.replaceState({}, "", url.toString());
    }
  }, [runMacro]);

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
      <AppShell showRightRail rightRailSlot={<MacroRightRail macros={groupedMacros} />}>
        <div className="flex-1 flex flex-col min-h-0 stagger-1">
          {/* ── Terminal Chrome Bar ────────────────────────────────── */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: "#131313", borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
              <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
              <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
            </div>
            <div className="flex-1 text-center text-xs text-on-surface-variant tracking-wide font-display truncate">
              terminal — Mission Control
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-on-surface-variant/60 font-mono">
                session: mctl-local
              </span>
            </div>
          </div>

          {/* ── Terminal Output ────────────────────────────────────── */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 p-5 font-mono text-sm leading-relaxed overflow-y-auto min-h-0 min-w-0 terminal-scanline terminal-glow"
            style={{ background: "#0E0E0E", color: "#E5E2E1" }}
            tabIndex={0}
          >
            {lines.length === 0 ? (
              <div className="text-on-surface-variant/60 italic flex flex-col gap-1">
                <span>Mission Control v0.1.0 — Terminal ready.</span>
                <span>
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
          <div
            className="flex items-center gap-3 px-4 py-2.5 shrink-0"
            style={{ background: "#131313", borderTop: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors rounded-none"
            >
              <span className="material-symbols-outlined text-base">delete</span>
              Clear
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors rounded-none"
            >
              <span className="material-symbols-outlined text-base">download</span>
              Export
            </button>

            {/* Connected indicator */}
            <div className="ml-auto flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-primary animate-pulse" : "bg-error"
                }`}
              />
              <span
                className={`text-[10px] font-medium ${
                  isConnected ? "text-primary" : "text-error"
                }`}
              >
                {isConnected ? "CONNECTED" : "DISCONNECTED"}
              </span>
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
