#!/usr/bin/env bun
/** Daily release, DNS, and TLS checks. */

import { refreshOperationsChecks } from "@/lib/operations";

export async function main(): Promise<void> {
  console.log("[operations] Starting daily operations checks");
  await refreshOperationsChecks();
  console.log("[operations] Operations checks completed");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[operations] Failed:", error);
    process.exit(1);
  });
}
