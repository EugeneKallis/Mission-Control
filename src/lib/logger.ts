/**
 * Global timestamped logging.
 *
 * Monkeypatches `console.log`, `console.warn`, and `console.error` to
 * prepend an ISO 8601 timestamp to every call. Importing this module
 * is a side-effect — it patches the global console once.
 *
 *   import "@/lib/logger";
 *
 * Skips patching in browser environments where DevTools already add
 * timestamps. On Node / Bun the patch applies at module load time.
 *
 * The `_log` / `_warn` / `_error` originals are captured before patching
 * so the patched versions can't recurse.
 */

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function formatTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  const ms = pad(date.getUTCMilliseconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
}

const IS_BROWSER =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as any).window !== "undefined" &&
  typeof (globalThis as any).document !== "undefined";

// Only patch on the server (Node / Bun). Browsers already show timestamps.
if (!IS_BROWSER) {
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    origLog(`[${formatTimestamp(new Date())}]`, ...args);
  };

  console.warn = (...args: unknown[]) => {
    origWarn(`[${formatTimestamp(new Date())}]`, ...args);
  };

  console.error = (...args: unknown[]) => {
    origError(`[${formatTimestamp(new Date())}]`, ...args);
  };
}
