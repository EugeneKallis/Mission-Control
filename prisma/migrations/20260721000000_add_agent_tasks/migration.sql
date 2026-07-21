-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "thinking_level" TEXT,
    "enabled_tools" TEXT,
    "disabled_tools" TEXT,
    "enabled_skills" TEXT,
    "no_skills" BOOLEAN NOT NULL DEFAULT false,
    "append_system" TEXT,
    "persist_session" BOOLEAN NOT NULL DEFAULT false,
    "timeout_sec" INTEGER NOT NULL DEFAULT 300,
    "last_run_at" DATETIME,
    "last_status" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "macro_id" INTEGER,
    "worker_timer_id" INTEGER,
    "agent_task_id" INTEGER,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "triggered_by" TEXT DEFAULT 'user',
    CONSTRAINT "history_macro_id_fkey" FOREIGN KEY ("macro_id") REFERENCES "macros" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "history_worker_timer_id_fkey" FOREIGN KEY ("worker_timer_id") REFERENCES "worker_timers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "history_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_history" ("id", "macro_id", "worker_timer_id", "start_time", "end_time", "status", "output", "triggered_by") SELECT "id", "macro_id", "worker_timer_id", "start_time", "end_time", "status", "output", "triggered_by" FROM "history";
DROP TABLE "history";
ALTER TABLE "new_history" RENAME TO "history";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
