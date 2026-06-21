/**
 * Formatting utilities — human-readable sizes, time formatting, etc.
 * Mirrors ~/ServerTool/util/ package.
 */

/**
 * Convert bytes to a human-readable string (e.g. "1.2 GB", "845 KB").
 */
export function humanReadableSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Generate a fake session ID string (like "f82k-91ns-00xa").
 */
export function fakeSessionId(): string {
  const rand = (len: number) =>
    Array.from({ length: len }, () => Math.random().toString(36)[2]).join("");
  return `${rand(4)}-${rand(4)}-${rand(4)}`;
}

/**
 * Extract the (Year) suffix from a media folder name, if present.
 */
export function extractYear(name: string): string | null {
  const match = name.match(/\((\d{4})\)$/);
  return match ? match[1] : null;
}
