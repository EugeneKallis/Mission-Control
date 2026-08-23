export const CONCURRENCY_POLICIES = ["skip", "queue-one", "allow"] as const;

export type ConcurrencyPolicy = (typeof CONCURRENCY_POLICIES)[number];

interface ActiveRun {
  historyId: Promise<number | undefined>;
  resolveHistoryId: (id: number | undefined) => void;
  done: Promise<void>;
}

interface Trigger {
  execute: (setHistoryId: (id: number) => void) => Promise<void>;
  onSkip: (activeRunId: number | undefined, reason: string) => Promise<void>;
}

/** In-process overlap control shared by all scheduled job types. */
export class ScheduledRunController {
  private active = new Map<string, Set<ActiveRun>>();
  private queued = new Map<string, Trigger>();

  async trigger(key: string, policy: ConcurrencyPolicy, trigger: Trigger): Promise<void> {
    const activeRuns = this.active.get(key);
    const active = activeRuns?.values().next().value as ActiveRun | undefined;

    if (active && policy !== "allow") {
      if (policy === "queue-one" && !this.queued.has(key)) {
        this.queued.set(key, trigger);
        return;
      }

      const activeRunId = await Promise.race([
        active.historyId,
        active.done.then(() => undefined),
      ]);
      const reason = policy === "queue-one"
        ? "another run is active and one trigger is already queued"
        : "another run is active";
      await trigger.onSkip(activeRunId, reason);
      return;
    }

    await this.start(key, trigger);
  }

  private async start(key: string, trigger: Trigger): Promise<void> {
    let resolveHistoryId!: (id: number | undefined) => void;
    const historyId = new Promise<number | undefined>((resolve) => {
      resolveHistoryId = resolve;
    });
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const run: ActiveRun = { historyId, resolveHistoryId, done };
    const runs = this.active.get(key) ?? new Set<ActiveRun>();
    runs.add(run);
    this.active.set(key, runs);

    try {
      await trigger.execute((id) => resolveHistoryId(id));
    } finally {
      resolveHistoryId(undefined);
      resolveDone();
      runs.delete(run);
      if (runs.size === 0) this.active.delete(key);

      const queued = this.queued.get(key);
      if (queued && !this.active.has(key)) {
        this.queued.delete(key);
        void this.start(key, queued);
      }
    }
  }
}

export function skippedRunOutput(reason: string, activeRunId: number | undefined): string {
  return `Skipped scheduled trigger: ${reason}. Active run ID: ${activeRunId ?? "unavailable"}.`;
}
