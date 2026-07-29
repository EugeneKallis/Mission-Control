"use client";

import Link from "next/link";

interface MobileHeaderProps {
  brand?: string;
  version?: string;
  uptime?: string;
  onMenuClick: () => void;
}

export function MobileHeader({
  brand = "Mission Control",
  version = "0.1.0",
  uptime,
  onMenuClick,
}: MobileHeaderProps) {
  return (
    <div className="lg:hidden flex items-center h-14 px-2 bg-surface shrink-0 border-b border-outline-variant/30">
      <button
        onClick={onMenuClick}
        className="flex items-center justify-center w-11 h-11 -ml-1 hover:bg-surface-container transition-colors rounded-[var(--radius-button)]"
        aria-label="Open menu"
      >
        <span className="material-symbols-outlined text-on-surface text-2xl">menu</span>
      </button>
      <Link
        href="/"
        className="ml-2 text-lg font-bold text-primary tracking-tight font-display hover:opacity-80 transition-opacity flex items-center h-11"
        aria-label="Go to home"
      >
        {brand}
      </Link>
      <div className="ml-auto text-[11px] text-on-surface-variant text-right leading-tight pr-1">
        <div className="font-medium">v{version}</div>
        {uptime && <div className="text-[10px]">{uptime}</div>}
      </div>
    </div>
  );
}
