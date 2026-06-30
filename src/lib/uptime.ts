/**
 * Format process uptime as a human-readable string.
 *
 * Examples:
 *   45          → "45s"
 *   360         → "6m"
 *   7200        → "2h"
 *   90000       → "1d 1h"
 *   200000      → "2d 7h"
 *   10000000    → "115d 17h"
 *
 * Rounds down — no decimal precision needed for a dashboard header.
 */

export function formatUptime(totalSeconds: number): string {
  const sec = Math.floor(totalSeconds);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  // Only show the two most significant units
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
