/**
 * Log helpers for one-off scripts.
 *
 * Scripts use console.log freely, but the dry-run banner and the
 * final "would have done X" / "done X" lines deserve consistent
 * formatting so the operator can scan a run.
 */

const TAG = "[script]";

export function info(msg: string): void {
  console.log(`${TAG} ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`${TAG} ${msg}`);
}

export function error(msg: string, err?: unknown): void {
  console.error(`${TAG} ${msg}`);
  if (err !== undefined) console.error(err);
}

export function banner(title: string, opts?: { dryRun?: boolean }): void {
  const line = "─".repeat(Math.max(0, 60 - title.length - 4));
  const prefix = opts?.dryRun ? " (DRY RUN)" : "";
  console.log(`\n${TAG} ── ${title}${prefix} ${line}`);
}

export function summary(rows: Record<string, string | number>): void {
  const maxLen = Math.max(...Object.keys(rows).map((k) => k.length));
  for (const [k, v] of Object.entries(rows)) {
    console.log(`${TAG} ${k.padEnd(maxLen)}  ${v}`);
  }
}
