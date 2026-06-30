-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_file_checks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_path" TEXT NOT NULL,
    "last_checked" DATETIME,
    "broken_count" INTEGER NOT NULL DEFAULT 0,
    "is_ignored" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "check_count" INTEGER NOT NULL DEFAULT 0,
    "media_dir" TEXT,
    "file_size" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_file_checks" ("broken_count", "created_at", "error_message", "file_path", "id", "is_ignored", "last_checked") SELECT "broken_count", "created_at", "error_message", "file_path", "id", "is_ignored", "last_checked" FROM "file_checks";
DROP TABLE "file_checks";
ALTER TABLE "new_file_checks" RENAME TO "file_checks";
CREATE UNIQUE INDEX "file_checks_file_path_key" ON "file_checks"("file_path");
CREATE INDEX "file_checks_status_idx" ON "file_checks"("status");
CREATE INDEX "file_checks_media_dir_idx" ON "file_checks"("media_dir");
CREATE INDEX "file_checks_last_checked_idx" ON "file_checks"("last_checked");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
