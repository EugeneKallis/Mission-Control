/**
 * In-process cron scheduler for Mission Control.
 * Mirrors the Go scheduler from ~/ServerTool/cmd/web/cron/cron.go.
 *
 * On server boot, loads all enabled schedules from the DB and registers
 * CronJob instances that call runMacro() with triggered_by = "schedule".
 *
 * The Schedules page API (Part 6) calls addSchedule / removeSchedule /
 * updateSchedule on create / toggle / delete.
 */

import { CronJob } from "cron";
import { getEnabledSchedules } from "@/lib/db/queries";

// Lazy import — runner is built by Part 9.
let runMacro: ((macroId: number, triggeredBy: string, agentHostname?: string) => Promise<{ historyId: number; status: string }>) | null = null;

async function getRunMacro() {
  if (!runMacro) {
    const mod = await import("@/lib/runner");
    runMacro = mod.runMacro;
    if (!runMacro) {
      throw new Error("[cron] runner module exists but runMacro export not found");
    }
  }
  return runMacro;
}

class CronScheduler {
  // Maps schedule DB id → CronJob
  private jobs = new Map<number, CronJob>();

  /** Load all enabled schedules from DB and start their jobs. */
  async init() {
    try {
      const schedules = await getEnabledSchedules();
      for (const s of schedules) {
        this.addJob(s.id, s.macroId, s.cronExpression);
      }
      console.log(`[cron] Loaded ${schedules.length} enabled schedule(s)`);
    } catch (err) {
      console.error("[cron] Failed to load schedules:", err);
    }
  }

  /** Register a new schedule job. */
  async addSchedule(
    id: number,
    macroId: number,
    cronExpression: string,
  ) {
    this.addJob(id, macroId, cronExpression);
    console.log(`[cron] Added schedule ${id} for macro ${macroId}: ${cronExpression}`);
  }

  /** Remove a schedule job (stop + delete). */
  async removeSchedule(id: number) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
      console.log(`[cron] Removed schedule ${id}`);
    }
  }

  /** Update a schedule: stop old, start new if enabled. */
  async updateSchedule(
    id: number,
    macroId: number,
    cronExpression: string,
    enabled: boolean,
  ) {
    await this.removeSchedule(id);
    if (enabled) {
      this.addJob(id, macroId, cronExpression);
    }
    console.log(`[cron] Updated schedule ${id} (enabled=${enabled})`);
  }

  /** Stop all jobs (used on server shutdown). */
  async stopAll() {
    for (const [id, job] of this.jobs) {
      job.stop();
      console.log(`[cron] Stopped schedule ${id}`);
    }
    this.jobs.clear();
  }

  // ── private ──────────────────────────────────────────────────────────

  private addJob(id: number, macroId: number, cronExpression: string) {
    // Stop existing job with same id (if any)
    const existing = this.jobs.get(id);
    if (existing) {
      existing.stop();
      this.jobs.delete(id);
    }

    const job = new CronJob(
      cronExpression,
      async () => {
        try {
          const fn = await getRunMacro();
          await fn(macroId, "schedule");
        } catch (err) {
          console.error(`[cron] Failed to run macro ${macroId}:`, err);
        }
      },
      null,   // onComplete
      true,   // start immediately
      "America/New_York",
    );

    this.jobs.set(id, job);
  }
}

/** Singleton instance — imported by instrumentation.ts and the schedules API. */
export const cronScheduler = new CronScheduler();
