"use client";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";
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
    <div className="lg:hidden flex items-center h-14 px-2 bg-surface shrink-0 border-b border-outline-variant/30 overflow-x-hidden">
      <button
        onClick={onMenuClick}
        className="flex items-center justify-center w-11 h-11 -ml-1 hover:bg-surface-container transition-colors rounded-[var(--radius-button)]"
        aria-label="Open menu"
      >
        <span className="material-symbols-outlined text-on-surface text-2xl">menu</span>
      </button>
      <Link
        href="/"
        className="ml-2 text-lg font-bold text-primary tracking-tight font-display hover:opacity-80 transition-opacity flex items-center gap-2 h-11 min-w-0 truncate"
        aria-label="Go to home"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mission-control-icon.png"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-lg"
        />
        <span className="truncate">{brand}</span>
      </Link>
      <div className="ml-auto flex items-center gap-1 shrink-0">
        <ThemeSwitcher variant="compact" />
        <div className="hidden sm:block text-[11px] text-on-surface-variant text-right leading-tight pr-1">
          <div className="font-medium">v{version}</div>
          {uptime && <div className="text-[10px]">{uptime}</div>}
        </div>
      </div>
    </div>
  );
}
