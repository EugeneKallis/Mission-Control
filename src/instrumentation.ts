/**
 * Next.js instrumentation hook.
 * Runs on server startup — registers the cron scheduler.
 *
 * Registered via next.config.ts experimental.instrumentationHook.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { cronScheduler } = await import("@/lib/cron-scheduler");
    await cronScheduler.init();
    console.log("[cron] Scheduler started");

    const { workerTimerScheduler } = await import("@/lib/worker-timer-scheduler");
    await workerTimerScheduler.init();
    console.log("[worker-timer] Scheduler started");

    const { agentTaskScheduler } = await import("@/lib/agent-task-scheduler");
    await agentTaskScheduler.init();
    console.log("[agent-task] Scheduler started");
  }
}
