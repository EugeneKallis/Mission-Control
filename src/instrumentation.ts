/**
 * Next.js instrumentation hook.
 * Runs on server startup — registers the cron scheduler.
 *
 * Registered via next.config.ts experimental.instrumentationHook.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import "@/lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { cronScheduler } = await import("@/lib/cron-scheduler");
    await cronScheduler.init();
    console.log("[cron] Scheduler started");
  }
}
