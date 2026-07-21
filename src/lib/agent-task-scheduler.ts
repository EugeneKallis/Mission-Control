/**
 * In-process cron scheduler for Scheduled Agent Tasks.
 *
 * On server boot, loads all enabled agent tasks from the DB and registers
 * CronJob instances that spawn the Pi CLI in headless print+JSON mode.
 *
 * The Agent Tasks page API calls addTask / removeTask / updateTask / runNow
 * on create / toggle / delete / run-now.
 */

import { CronJob } from "cron";
import { spawn, type ChildProcess } from "child_process";
import {
  getEnabledAgentTasks,
  getAgentTask,
  updateAgentTaskRunStatus,
  createHistory,
  updateHistory,
  flushHistoryOutput,
  cleanOldAgentTaskHistory,
} from "@/lib/db/queries";
import { getPiPath } from "@/lib/pi/pi-path";
import { buildAgentTaskSpawnArgs, agentTaskRowToSpawnConfig, type AgentTaskSpawnConfig } from "@/lib/pi/headless-prompt";
import { renderJsonEvent } from "@/lib/pi/json-event-renderer";

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum bytes of transcript stored in the history output column. */
const OUTPUT_CAP_BYTES = 200_000; // ~200 KB

/** Flush interval (ms) for streaming transcript to the DB mid-run. */
const FLUSH_INTERVAL_MS = 1_500;

/** Grace period before SIGKILL after SIGTERM. */
const KILL_GRACE_MS = 5_000;

/** Number of recent history rows to keep per task after cleanup. */
const HISTORY_KEEP_COUNT = 50;

// ── Scheduler ──────────────────────────────────────────────────────────────

class AgentTaskScheduler {
  /** Maps task DB id → CronJob instance. */
  private jobs = new Map<number, CronJob>();

  /** Set of task IDs with an active run (overlap guard). */
  private running = new Set<number>();

  // ── Lifecycle management ───────────────────────────────────────────

  /** Load all enabled tasks from DB and start their cron jobs. */
  async init() {
    try {
      const tasks = await getEnabledAgentTasks();
      for (const t of tasks) {
        this.addJob(t.id, agentTaskRowToSpawnConfig(t));
      }
      console.log(`[agent-task] Loaded ${tasks.length} enabled task(s)`);
    } catch (err) {
      console.error("[agent-task] Failed to load tasks:", err);
    }
  }

  /** Register a new cron job for a task. */
  async addTask(
    id: number,
    task: AgentTaskSpawnConfig & { cronExpression?: string; timeoutSec?: number },
  ) {
    this.addJob(id, task);
    console.log(`[agent-task] Added task ${id}: ${task.prompt.slice(0, 60)}…`);
  }

  /** Remove and stop a cron job. */
  async removeTask(id: number) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
      console.log(`[agent-task] Removed task ${id}`);
    }
  }

  /** Update a task: stop old job, start new if enabled. */
  async updateTask(
    id: number,
    task: AgentTaskSpawnConfig & { cronExpression?: string; timeoutSec?: number },
    enabled: boolean,
  ) {
    await this.removeTask(id);
    if (enabled) {
      this.addJob(id, task);
    }
    console.log(`[agent-task] Updated task ${id} (enabled=${enabled})`);
  }

  /** Run a task immediately, regardless of cron schedule. */
  async runNow(id: number): Promise<void> {
    if (this.running.has(id)) {
      console.log(`[agent-task] Task ${id} is already running — skipping runNow`);
      return;
    }

    try {
      const task = await getAgentTask(id);
      const config = agentTaskRowToSpawnConfig(task);
      await this.runOnce(id, config, config.timeoutSec);
    } catch (err) {
      console.error(`[agent-task] runNow(${id}) failed:`, err);
    }
  }

  /** Stop all jobs (used on server shutdown). */
  async stopAll() {
    for (const [id, job] of this.jobs) {
      job.stop();
      console.log(`[agent-task] Stopped task ${id}`);
    }
    this.jobs.clear();
  }

  // ── Private: Run a single task ─────────────────────────────────────

  /**
   * Execute the pi process for one task and capture the transcript.
   * Handles the full lifecycle: history creation, JSON-line parsing,
   * incremental flush, timeout, exit, and history finalisation.
   */
  private async runOnce(
    id: number,
    config: AgentTaskSpawnConfig,
    timeoutSec: number,
  ) {
    if (this.running.has(id)) {
      console.log(`[agent-task] Task ${id} already running — skipping tick`);
      return;
    }

    this.running.add(id);
    let historyId: number | undefined;
    let transcript = "";
    let flushInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let childProcess: ChildProcess | null = null;
    let dirty = false; // true when transcript has changed since last flush
    let done = false;

    try {
      console.log(`[agent-task] Running task ${id}…`);
      const startTime = new Date();

      // Build spawn args using the pure helpers
      const piPath = getPiPath();
      const args = buildAgentTaskSpawnArgs(config);

      // Create history entry
      const history = await createHistory({
        agentTaskId: id,
        startTime,
        status: "running",
        triggeredBy: "schedule",
      });
      historyId = history.id;

      // ── Flush interval ─────────────────────────────────────────
      flushInterval = setInterval(async () => {
        if (dirty && historyId) {
          dirty = false;
          try {
            await flushHistoryOutput(historyId, transcript.slice(-OUTPUT_CAP_BYTES));
          } catch {
            dirty = true; // retry on next tick
          }
        }
      }, FLUSH_INTERVAL_MS);

      // ── Spawn pi ───────────────────────────────────────────────
      const output = await new Promise<string>((resolve, reject) => {
        let resolved = false;

        childProcess = spawn(piPath, args, {
          stdio: ["ignore", "pipe", "pipe"],
          cwd: process.cwd(),
        });

        // Timeout
        if (timeoutSec > 0) {
          timeoutHandle = setTimeout(() => {
            if (resolved) return;
            console.log(`[agent-task] Task ${id} timed out after ${timeoutSec}s`);
            childProcess?.kill("SIGTERM");
            setTimeout(() => {
              if (!resolved && childProcess && !childProcess.killed) {
                childProcess.kill("SIGKILL");
              }
            }, KILL_GRACE_MS).unref();
          }, timeoutSec * 1000);
        }

        childProcess.stdout?.on("data", (data: Buffer) => {
          const text = data.toString("utf-8");
          const lines = text.split("\n");

          for (const rawLine of lines) {
            if (!rawLine.trim()) continue;
            if (rawLine.trim().startsWith(":")) continue; // SSE comment

            try {
              const event = JSON.parse(rawLine.trim()) as { type: string; [key: string]: unknown };
              const rendered = renderJsonEvent(event);
              if (rendered !== null) {
                transcript += rendered + "\n";
                dirty = true;
              }
            } catch {
              // Skip non-JSON lines (stderr may mix in)
              transcript += rawLine + "\n";
              dirty = true;
            }
          }
        });

        childProcess.stderr?.on("data", (data: Buffer) => {
          const text = data.toString("utf-8").trim();
          if (text) {
            transcript += `[stderr] ${text}\n`;
            dirty = true;
          }
        });

        childProcess.on("close", (code) => {
          resolved = true;
          if (code === 0 || code === null) {
            resolve(transcript || "(no output)");
          } else {
            reject(new Error(`Pi exited with code ${code}`));
          }
        });

        childProcess.on("error", (err) => {
          resolved = true;
          reject(err);
        });
      }).finally(() => {
        done = true;
      });

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      console.log(`[agent-task] Task ${id} completed in ${duration}ms`);

      // Finalize history
      if (historyId) {
        await updateHistory(historyId, {
          endTime,
          status: "success",
          output: output.slice(-OUTPUT_CAP_BYTES),
        });
      }
      await updateAgentTaskRunStatus(id, "success");

      // Prune old history
      await cleanOldAgentTaskHistory(id, HISTORY_KEEP_COUNT);
    } catch (err) {
      const endTime = new Date();
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[agent-task] Task ${id} failed:`, err);

      if (historyId) {
        const finalOutput = transcript
          ? transcript.slice(-OUTPUT_CAP_BYTES)
          : errorMsg.slice(-OUTPUT_CAP_BYTES);

        await updateHistory(historyId, {
          endTime,
          status: "error",
          output: finalOutput,
        }).catch(() => {});
      }
      await updateAgentTaskRunStatus(id, "error").catch(() => {});
    } finally {
      // Cleanup
      if (flushInterval) clearInterval(flushInterval);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const proc = childProcess as ChildProcess | null;
      if (proc && !proc.killed) {
        proc.kill("SIGTERM");
      }
      this.running.delete(id);
    }
  }

  // ── Private: Register a cron job ─────────────────────────────────

  private addJob(id: number, task: AgentTaskSpawnConfig & { cronExpression?: string; timeoutSec?: number }) {
    // Stop existing job with same id
    const existing = this.jobs.get(id);
    if (existing) {
      existing.stop();
      this.jobs.delete(id);
    }

    const timeout = task.timeoutSec ?? 300;
    // Build config without scheduler-only fields for the spawn args
    const { cronExpression, timeoutSec: _ts, ...spawnConfig } = task;

    const cronExpr = cronExpression;
    if (!cronExpr) {
      console.error(`[agent-task] Task ${id} has no cron expression — skipping`);
      return;
    }

    const job = new CronJob(
      cronExpr,
      () => {
        void this.runOnce(id, spawnConfig, timeout);
      },
      null,
      true, // start immediately
      "America/New_York",
    );

    this.jobs.set(id, job);
  }
}

/** Singleton instance — imported by instrumentation.ts and the API routes. */
export const agentTaskScheduler = new AgentTaskScheduler();
