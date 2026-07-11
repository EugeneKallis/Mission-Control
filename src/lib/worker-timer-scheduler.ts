/**
 * In-process cron scheduler for Worker Timers.
 *
 * On server boot, loads all enabled worker timers from the DB and registers
 * CronJob instances that run the specified worker script via child_process.
 *
 * The Schedules page API calls addTimer / removeTimer / updateTimer on create / toggle / delete.
 */

import { CronJob } from "cron";
import { spawn } from "child_process";
import {
  getEnabledWorkerTimers,
  listWorkerTimers,
  createWorkerTimer,
  updateWorkerTimerRunStatus,
  createHistory,
  updateHistory,
} from "@/lib/db/queries";

// Predefined worker registry — maps friendly names to their script paths
export const WORKER_REGISTRY: Record<string, { path: string; description: string; defaultCron: string }> = {
  scraper: {
    path: "src/workers/scraper-worker.ts",
    description: "Runs all three scrape sources (141jav, projectjav, pornrips) sequentially",
    defaultCron: "*/30 * * * *",
  },
  "energy-price": {
    path: "src/workers/energy-price-scraper.ts",
    description: "Scrapes EnergizeCT.com for supplier rates using Playwright",
    defaultCron: "0 8 * * *",
  },
};

/** Ensure the default worker timers exist in the DB (disabled by default). */
async function ensureDefaultTimers() {
  const existing = await listWorkerTimers();
  const existingPaths = new Set(existing.map((t) => t.workerPath));

  for (const [key, worker] of Object.entries(WORKER_REGISTRY)) {
    if (!existingPaths.has(worker.path)) {
      console.log(`[worker-timer] Creating default timer: ${key} (${worker.defaultCron})`);
      await createWorkerTimer({
        name: worker.path.split("/").pop()?.replace(".ts", "") ?? key,
        workerPath: worker.path,
        cronExpression: worker.defaultCron,
        enabled: false, // Start disabled
      });
    }
  }
}

class WorkerTimerScheduler {
  // Maps timer DB id → CronJob
  private jobs = new Map<number, CronJob>();

  /** Load all enabled timers from DB and start their jobs. */
  async init() {
    try {
      // Ensure default timers exist
      await ensureDefaultTimers();
      
      const timers = await getEnabledWorkerTimers();
      for (const t of timers) {
        this.addJob(t.id, t.workerPath, t.cronExpression);
      }
      console.log(`[worker-timer] Loaded ${timers.length} enabled timer(s)`);
    } catch (err) {
      console.error("[worker-timer] Failed to load timers:", err);
    }
  }

  /** Register a new timer job. */
  async addTimer(id: number, workerPath: string, cronExpression: string) {
    this.addJob(id, workerPath, cronExpression);
    console.log(`[worker-timer] Added timer ${id} for ${workerPath}: ${cronExpression}`);
  }

  /** Remove a timer job (stop + delete). */
  async removeTimer(id: number) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
      console.log(`[worker-timer] Removed timer ${id}`);
    }
  }

  /** Update a timer: stop old, start new if enabled. */
  async updateTimer(id: number, workerPath: string, cronExpression: string, enabled: boolean) {
    await this.removeTimer(id);
    if (enabled) {
      this.addJob(id, workerPath, cronExpression);
    }
    console.log(`[worker-timer] Updated timer ${id} (enabled=${enabled})`);
  }

  /** Stop all jobs (used on server shutdown). */
  async stopAll() {
    for (const [id, job] of this.jobs) {
      job.stop();
      console.log(`[worker-timer] Stopped timer ${id}`);
    }
    this.jobs.clear();
  }

  // ── private ──────────────────────────────────────────────────────────

  private addJob(id: number, workerPath: string, cronExpression: string) {
    // Stop existing job with same id (if any)
    const existing = this.jobs.get(id);
    if (existing) {
      existing.stop();
      this.jobs.delete(id);
    }

    const job = new CronJob(
      cronExpression,
      async () => {
        let historyId: number | undefined;
        try {
          console.log(`[worker-timer] Running ${workerPath}...`);
          const startTime = new Date();

          // Create history entry for this run
          const history = await createHistory({
            workerTimerId: id,
            startTime,
            status: "running",
            triggeredBy: "schedule",
          });
          historyId = history.id;

          // Run the worker as a child process using bun
          const output = await new Promise<string>((resolve, reject) => {
            let stdout = "";
            let stderr = "";

            const child = spawn("bun", ["run", workerPath], {
              stdio: ["ignore", "pipe", "pipe"],
              cwd: process.cwd(),
            });

            child.stdout?.on("data", (data: Buffer) => {
              stdout += data.toString();
            });

            child.stderr?.on("data", (data: Buffer) => {
              stderr += data.toString();
            });

            child.on("close", (code) => {
              if (code === 0) {
                resolve(stdout || "(no output)");
              } else {
                reject(new Error(`Worker exited with code ${code}\n${stderr}`));
              }
            });

            child.on("error", reject);
          });

          const endTime = new Date();
          const duration = endTime.getTime() - startTime.getTime();
          console.log(`[worker-timer] ${workerPath} completed in ${duration}ms`);

          // Update history with success
          if (historyId) {
            await updateHistory(historyId, {
              endTime,
              status: "success",
              output: output.slice(-10000), // Keep last 10KB of output
            });
          }

          await updateWorkerTimerRunStatus(id, "success");
        } catch (err) {
          const endTime = new Date();
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[worker-timer] Failed to run ${workerPath}:`, err);

          // Update history with error
          if (historyId) {
            await updateHistory(historyId, {
              endTime,
              status: "error",
              output: errorMsg.slice(-10000),
            }).catch(() => {});
          }

          await updateWorkerTimerRunStatus(id, "error").catch(() => {});
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
export const workerTimerScheduler = new WorkerTimerScheduler();
