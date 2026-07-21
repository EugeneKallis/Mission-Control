/**
 * Pi binary path resolution.
 *
 * Shared between the singleton Process Manager (RPC mode) and the
 * headless Agent Task scheduler (--mode json / print mode).
 *
 * Exports:
 *   getPiPath()       — cached resolver, throws if not found
 *   resolvePiPathSync() — non-cached resolver, always re-checks
 */

import { execSync } from "child_process";
import { accessSync, constants } from "fs";

const CANDIDATES = [
  "/opt/homebrew/bin/pi",
  "/usr/local/bin/pi",
  "/usr/bin/pi",
  "/home/linuxbrew/.linuxbrew/bin/pi",
];

let resolvedPiPath: string | null = null;

/**
 * Resolve the pi binary path by checking known locations and `which pi`.
 * Always re-checks — no caching. Throws if not found.
 */
export function resolvePiPathSync(): string {
  try {
    const path = execSync("which pi", { encoding: "utf-8", timeout: 5000 }).trim();
    if (path) return path;
  } catch {
    // fall through
  }

  for (const candidate of CANDIDATES) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Pi binary not found. Install it with: npm install -g @earendil-works/pi-coding-agent"
  );
}

/**
 * Resolve the pi binary path with caching.
 * Returns the cached result on repeated calls. Throws if not found.
 */
export function getPiPath(): string {
  if (resolvedPiPath) return resolvedPiPath;
  resolvedPiPath = resolvePiPathSync();
  return resolvedPiPath;
}

/**
 * Reset the cached pi path (useful for tests).
 */
export function resetPiPathCache(): void {
  resolvedPiPath = null;
}
