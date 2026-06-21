/**
 * Shared TypeScript types for Mission Control.
 * Mirrors the clean JSON response types from ~/ServerTool/cmd/web/handler/response_types.go.
 */

// ── Macro Types ──────────────────────────────────────────────────────────

export interface MacroCommand {
  ord: number;
  cmd: string;
  working_dir?: string;
}

export interface Macro {
  id: number;
  name: string;
  description: string;
  groupName: string;
  ord: number;
  runOnAgent: boolean;
  agentHostname: string;
  commands: string; // JSON string of MacroCommand[]
}

export interface MacroGroup {
  id: number;
  name: string;
  ord: number;
}

export interface GroupWithMacros {
  group: MacroGroup | null;
  macros: Macro[];
}

// ── History Types ─────────────────────────────────────────────────────────

export interface History {
  id: number;
  macro_id: number;
  start_time: string; // ISO 8601
  end_time: string | null;
  status: string; // "running" | "success" | "failed"
  output: string | null;
  triggered_by: string | null; // "user" | "schedule"
  macro_name: string;
}

// ── Schedule Types ────────────────────────────────────────────────────────

export interface Schedule {
  id: number;
  macro_id: number;
  cron_expression: string;
  enabled: boolean;
  created_at: string | null; // ISO 8601
  macro_name: string;
}

// ── Server Agent Types ────────────────────────────────────────────────────

export interface ServerAgent {
  id: number;
  hostname: string;
  ip_address: string | null;
  cpu_usage: number | null;
  memory_total: number | null;
  memory_used: number | null;
  last_seen: string | null; // ISO 8601
  version: string | null;
  update_requested: boolean | null;
  restart_requested: boolean | null;
  network_sent: number | null;
  network_recv: number | null;
}

// ── Scraper Types ─────────────────────────────────────────────────────────

export interface ScrapeResult {
  id: number;
  source: string;
  title: string;
  image_url: string | null;
  magnet_link: string | null;
  torrent_link: string | null;
  unique_key: string;
  info_hash: string | null;
  file_size: string | null;
  tags: string | null; // comma-separated
  is_hidden: boolean;
  is_downloaded: boolean;
  hidden_at: string | null;
  created_at: string | null;
}

// ── File Tree Types ───────────────────────────────────────────────────────

export interface FileTreeItem {
  id: number;
  path: string;
  name: string;
  is_dir: boolean;
  parent_path: string;
  link_target: string | null;
  file_count: number | null;
  updated_at: string | null;
}

// Used by the file-tree viewer components
export interface FileItem {
  path: string;
  name: string;
  is_dir: boolean;
  file_count: number;
  parent: string;
  depth: number;
}

// ── Config Types ──────────────────────────────────────────────────────────

export interface AppConfig {
  real_debrid_api_key: string;
}

// ── Arr Types ─────────────────────────────────────────────────────────────

export interface ArrInstance {
  type: "sonarr" | "radarr";
  name: string;
  url: string;
  apiKey: string;
}

export interface ArrMovie {
  id: number;
  title: string;
  titleSlug: string;
  path: string;
  hasFile: boolean;
  monitored: boolean;
  status: string; // "announced" | "inCinemas" | "released" | "deleted"
  tmdbId?: number;
}

export interface ArrSeries {
  id: number;
  title: string;
  titleSlug: string;
  path: string;
  tvdbId?: number;
}

// ── Decypharr / Torrent Types ─────────────────────────────────────────────

export interface DecypharrClientConfig {
  baseUrl: string;
  arrName: string;
  downloadFolder: string;
}

// ── Plex Types ────────────────────────────────────────────────────────────

export interface PlexConfig {
  token: string;
  url: string;
  watchlistRss?: string;
}
