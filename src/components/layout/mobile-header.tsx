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
    <div className="lg:hidden flex items-center h-14 px-4 bg-surface shrink-0 border-b border-outline-variant/30">
      <button
        onClick={onMenuClick}
        className="p-1.5 -ml-1.5 hover:bg-surface-container-high transition-colors"
        aria-label="Open menu"
      >
        <span className="material-symbols-outlined text-on-surface text-2xl">menu</span>
      </button>
      <Link
        href="/"
        className="ml-3 text-lg font-bold text-primary tracking-tight font-display hover:opacity-80 transition-opacity"
        aria-label="Go to home"
      >
        {brand}
      </Link>
      <div className="ml-auto text-[11px] text-on-surface-variant text-right leading-tight">
        <div>v{version}</div>
        {uptime && <div>{uptime}</div>}
      </div>
    </div>
  );
}
