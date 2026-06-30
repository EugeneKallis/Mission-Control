"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItemProps {
  label: string;
  icon: string;
  href: string;
  color?: string;
  /**
   * Optional numeric badge rendered to the right of the label.
   * Only shown when defined and > 0. Used to surface counts that
   * need attention (e.g. broken-link files).
   */
  badge?: number;
}

const accentColors: Record<string, string> = {
  amber: "hover:bg-amber-500/10",
  cyan: "hover:bg-cyan-500/10",
  teal: "hover:bg-teal-500/10",
  green: "hover:bg-green-500/10",
  primary: "hover:bg-primary/10",
  violet: "hover:bg-violet-500/10",
  rose: "hover:bg-rose-500/10",
};

export function NavItem({ label, icon, href, color = "primary", badge }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      href={href}
      className={`
        flex items-center gap-3 px-5 py-2 text-sm font-medium transition-colors mx-2
        ${isActive ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:bg-surface-container-high"}
        ${accentColors[color] ?? accentColors.primary}
      `}
    >
      <span className="material-symbols-outlined text-xl">{icon}</span>
      <span>{label}</span>
      {showBadge && (
        <span
          className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 text-[10px] font-mono font-semibold rounded-none"
          style={{
            background: "#3D1F1F",
            color: "#FFB4AB",
            border: "1px solid rgba(255, 180, 171, 0.35)",
          }}
          title={`${badge} broken`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
