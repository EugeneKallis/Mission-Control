"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItemProps {
  label: string;
  icon: string;
  href: string;
  color?: string;
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

export function NavItem({ label, icon, href, color = "primary" }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

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
    </Link>
  );
}
