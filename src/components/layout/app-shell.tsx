"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/toast-provider";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { MobileHeader } from "@/components/layout/mobile-header";

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
  const [uptime, setUptime] = useState<string | undefined>();
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Fetch server uptime
  useEffect(() => {
    fetch("/api/uptime")
      .then((r) => r.json())
      .then((data) => setUptime(data.uptime))
      .catch(() => {});
    // Refresh every 60s to keep the label accurate
    const interval = setInterval(() => {
      fetch("/api/uptime")
        .then((r) => r.json())
        .then((data) => setUptime(data.uptime))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Escape key closes the mobile drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // Close drawer on route change
  useEffect(() => {
    // The drawer is UI state that must reset when navigation changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <ToastProvider>
      <div className="h-dvh w-full overflow-hidden flex flex-row bg-bg">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-[260px] bg-surface flex-col z-20 shrink-0 border-r border-outline-variant/30">
          <SidebarContent uptime={uptime} />
        </aside>

        {/* Mobile drawer */}
        <>
          {/* Backdrop (only rendered when open) */}
          {drawerOpen && (
            <div
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm lg:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          )}
          {/* Drawer stays mounted so mobile navigation links are available to the browser before opening. */}
          <div
            ref={drawerRef}
            className={`
              fixed inset-y-0 left-0 w-[300px] bg-surface shadow-2xl z-50
              transform transition-transform duration-300 ease-out
              lg:hidden flex flex-col shrink-0
              ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
            `}
            role={drawerOpen ? "dialog" : undefined}
            aria-modal={drawerOpen ? "true" : undefined}
            aria-label="Navigation menu"
          >
            <SidebarContent uptime={uptime} onClose={() => setDrawerOpen(false)} />
          </div>
        </>

        {/* Main content area */}
        <main className="flex-1 flex flex-col min-h-0 bg-bg relative min-w-0 overflow-hidden">
          {/* Mobile header */}
          <MobileHeader uptime={uptime} onMenuClick={() => setDrawerOpen(true)} />

          {/* Scrollable content */}
          <div
            id="main-scroll-container"
            className={`flex-1 flex flex-col min-h-0 ${noScroll ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"}`}
          >
            {children}
          </div>
        </main>

        {/* Right macros rail (home page only, xl+) */}
        {showRightRail && (
          <aside className="hidden xl:flex w-[240px] bg-surface flex-col z-20 shrink-0 border-l border-outline-variant/30">
            <div className="h-12 flex items-center px-4 shrink-0 border-b border-outline-variant/30">
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider font-display">
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
    </ToastProvider>
  );
}
