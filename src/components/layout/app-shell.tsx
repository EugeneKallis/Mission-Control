"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ToastProvider } from "@/components/toast-provider";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { MobileHeader } from "@/components/layout/mobile-header";
import { AgentModal } from "@/components/agent-modal";

interface AppShellProps {
  children: ReactNode;
  /**
   * Whether the main content area should allow vertical scrolling.
   * Some pages (like Home) manage their own scroll container.
   */
  noScroll?: boolean;
  /**
   * Show the right "Macros" rail on the home page (xl+ only).
   */
  showRightRail?: boolean;
  /**
   * Content to render inside the right rail (e.g. MacroRightRail).
   * Only rendered when showRightRail is true.
   */
  rightRailSlot?: ReactNode;
}

export function AppShell({ children, noScroll = false, showRightRail = false, rightRailSlot }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [pendingMacroId, setPendingMacroId] = useState<number | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Listen for agent-macro clicks from sidebar / right rail
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ macroId: number; macroName: string }>).detail;
      setPendingMacroId(detail.macroId);
      setAgentModalOpen(true);
    };
    window.addEventListener("macro:run-agent", handler);
    return () => window.removeEventListener("macro:run-agent", handler);
  }, []);

  const handleAgentRun = (macroId: number, agent: string) => {
    // The home page owns the SSE terminal stream, so funnel the run
    // through it. If we're already on "/", dispatch the in-app event;
    // otherwise navigate to the deep-link URL the home page executes
    // on mount.
    if (pathname === "/") {
      window.dispatchEvent(
        new CustomEvent("macro:run", {
          detail: { macroId, agent },
        }),
      );
    } else {
      router.push(
        `/?run_macro=${macroId}&agent=${encodeURIComponent(agent)}`,
      );
    }
  };

  return (
    <ToastProvider>
      <div className="h-dvh w-full overflow-hidden flex flex-row bg-bg">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-[240px] bg-surface flex-col z-20 shrink-0">
          <SidebarContent />
        </aside>

        {/* Mobile drawer */}
        <>
          {/* Backdrop */}
          {drawerOpen && (
            <div
              className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm lg:hidden"
              onClick={() => setDrawerOpen(false)}
            />
          )}
          {/* Drawer */}
          <div
            className={`
              fixed inset-y-0 left-0 w-[280px] bg-surface shadow-2xl z-50
              transform transition-transform duration-300 ease-out
              lg:hidden flex flex-col shrink-0
              ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <SidebarContent />
          </div>
        </>

        {/* Main content area */}
        <main className="flex-1 flex flex-col min-h-0 bg-bg relative min-w-0 overflow-hidden">
          {/* Mobile header */}
          <MobileHeader onMenuClick={() => setDrawerOpen(true)} />

          {/* Scrollable content */}
          <div
            id="main-scroll-container"
            className={`flex-1 flex flex-col ${noScroll ? "" : "overflow-y-auto overflow-x-hidden"}`}
          >
            {children}
          </div>
        </main>

        {/* Right macros rail (home page only, xl+) */}
        {showRightRail && (
          <aside className="hidden xl:flex w-[220px] bg-surface flex-col z-20 shrink-0 border-l border-outline-variant/30">
            <div className="h-12 flex items-center px-4 shrink-0 border-b border-outline-variant/30">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-display">
                Macros
              </span>
            </div>
            {rightRailSlot ?? (
              <nav className="flex-1 overflow-y-auto py-2">
                <div className="px-5 py-4 text-[11px] text-on-surface-variant italic">
                  No macros loaded.
                </div>
              </nav>
            )}
          </aside>
        )}
      </div>

      {/* Global agent modal */}
      <AgentModal
        open={agentModalOpen}
        onClose={() => {
          setAgentModalOpen(false);
          setPendingMacroId(null);
        }}
        macroId={pendingMacroId}
        onRun={handleAgentRun}
      />
    </ToastProvider>
  );
}
