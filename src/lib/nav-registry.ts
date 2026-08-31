/** Canonical sidebar page registry and default organization. */

export type NavBadgeKey = "pve" | "operations" | "logs" | "bl-finder" | "energy";

export interface NavEntry {
  key: string;
  label: string;
  icon: string;
  href: string;
  color: string;
  badge?: NavBadgeKey;
  badgeTitle?: string;
  fixed?: boolean;
}

export interface NavGroup {
  id: string;
  name: string;
  collapsed: boolean;
  items: string[];
}

export interface SidebarLayout {
  groups: NavGroup[];
  hidden: string[];
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { key: "chat", label: "Pi Agent", icon: "smart_toy", href: "/chat", color: "primary" },
  { key: "pi-settings", label: "Pi Settings", icon: "settings", href: "/pi-settings", color: "primary" },
  { key: "agent-tasks", label: "Scheduled Tasks", icon: "schedule_send", href: "/agent-tasks", color: "primary" },
  { key: "history", label: "History", icon: "history", href: "/history", color: "amber" },
  { key: "schedules", label: "Schedules", icon: "schedule", href: "/schedules", color: "cyan" },
  { key: "pve", label: "Proxmox", icon: "dns", href: "/pve", color: "green", badge: "pve", badgeTitle: "alerts" },
  { key: "local-arrs", label: "Local Arrs", icon: "video_library", href: "/local-arrs", color: "teal" },
  { key: "arr-drift", label: "Arr Drift", icon: "difference", href: "/arr-drift", color: "teal" },
  { key: "docker-logs", label: "Docker Logs", icon: "terminal", href: "/docker-logs", color: "primary" },
  { key: "pulse", label: "Pulse", icon: "monitor_heart", href: "/pulse", color: "cyan" },
  { key: "integrations", label: "Integrations", icon: "lan", href: "/integrations", color: "cyan" },
  { key: "operations", label: "Operations", icon: "hub", href: "/operations", color: "amber", badge: "operations", badgeTitle: "alerts" },
  { key: "logs", label: "Log Viewer", icon: "terminal", href: "/logs", color: "primary", badge: "logs", badgeTitle: "errors" },
  { key: "bl-finder", label: "BL Finder", icon: "broken_image", href: "/database/bl-finder", color: "amber", badge: "bl-finder" },
  { key: "energy-prices", label: "Energy Prices", icon: "bolt", href: "/energy-prices", color: "lime", badge: "energy", badgeTitle: "better rates" },
  { key: "admin", label: "Admin", icon: "admin_panel_settings", href: "/admin", color: "violet" },
  { key: "nzb", label: "NZB Viewer", icon: "folder_open", href: "/nzb", color: "teal" },
  { key: "debrid", label: "Debrid Viewer", icon: "cloud", href: "/debrid", color: "teal" },
  { key: "database", label: "Database", icon: "table_chart", href: "/database", color: "violet" },
  { key: "scraper", label: "Scraper", icon: "download", href: "/scraper", color: "rose" },
  { key: "navigation", label: "Navigation", icon: "view_sidebar", href: "/navigation", color: "primary", fixed: true },
];

export const NAV_BY_KEY: Record<string, NavEntry> = Object.fromEntries(NAV_ENTRIES.map((entry) => [entry.key, entry]));

export const DEFAULT_NAV_GROUPS: NavGroup[] = [
  { id: "agent", name: "Agent", collapsed: false, items: ["chat", "pi-settings", "agent-tasks"] },
  { id: "activity", name: "Activity", collapsed: false, items: ["history", "schedules"] },
  { id: "monitoring", name: "Monitoring", collapsed: false, items: ["pve", "local-arrs", "arr-drift", "docker-logs", "pulse", "integrations", "operations", "logs", "bl-finder"] },
  { id: "settings", name: "Settings", collapsed: false, items: ["energy-prices", "admin"] },
  { id: "archive", name: "Archive", collapsed: true, items: ["nzb", "debrid", "database"] },
  { id: "ungrouped", name: "Ungrouped", collapsed: false, items: ["scraper"] },
];

export function defaultSidebarLayout(): SidebarLayout {
  return { groups: DEFAULT_NAV_GROUPS.map((group) => ({ ...group, items: [...group.items] })), hidden: [] };
}
