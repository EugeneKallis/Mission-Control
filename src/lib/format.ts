/**
 * Formatting utilities — human-readable sizes, time formatting, etc.
 * Mirrors ~/ServerTool/util/ package.
 */

/**
 * Convert bytes to a human-readable string (e.g. "1.2 GB", "845 KB").
 */
export function humanReadableSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let v = bytes / 1024;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const isInt = Math.abs(v - Math.round(v)) < 0.05;
  const decimals = i === 0 || isInt || v >= 100 ? 0 : 1;
  return `${v.toFixed(decimals)} ${units[i]}`;
}

/**
 * Convert a Date to EST-style string (e.g. "Jun 20, 15:04:05").
 */
export function formatDateTime(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  const secs = String(date.getSeconds()).padStart(2, "0");
  return `${month} ${day}, ${hours}:${mins}:${secs}`;
}

/**
 * Format a duration from two Date objects (end - start), rounded to seconds.
 */
export function formatDuration(end: Date, start: Date): string {
  const ms = end.getTime() - start.getTime();
  const totalSeconds = Math.round(ms / 1000);
  return formatSeconds(totalSeconds);
}

/**
 * Format a duration in seconds as "1d 2h" / "3h 45m" / "12m 34s" / "5s".
 * Shows the two most significant units.
 */
export function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0s";
  const sec = Math.round(totalSeconds);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
