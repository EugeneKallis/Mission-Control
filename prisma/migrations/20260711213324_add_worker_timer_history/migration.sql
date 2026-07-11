-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "macro_id" INTEGER,
    "worker_timer_id" INTEGER,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "triggered_by" TEXT DEFAULT 'user',
    CONSTRAINT "history_macro_id_fkey" FOREIGN KEY ("macro_id") REFERENCES "macros" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "history_worker_timer_id_fkey" FOREIGN KEY ("worker_timer_id") REFERENCES "worker_timers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_history" ("end_time", "id", "macro_id", "output", "start_time", "status", "triggered_by") SELECT "end_time", "id", "macro_id", "output", "start_time", "status", "triggered_by" FROM "history";
DROP TABLE "history";
ALTER TABLE "new_history" RENAME TO "history";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
