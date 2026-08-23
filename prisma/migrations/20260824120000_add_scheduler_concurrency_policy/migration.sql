ALTER TABLE "schedules" ADD COLUMN "concurrency_policy" TEXT NOT NULL DEFAULT 'skip';
ALTER TABLE "worker_timers" ADD COLUMN "concurrency_policy" TEXT NOT NULL DEFAULT 'skip';
ALTER TABLE "agent_tasks" ADD COLUMN "concurrency_policy" TEXT NOT NULL DEFAULT 'skip';
