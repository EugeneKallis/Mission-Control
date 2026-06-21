-- CreateTable
CREATE TABLE "macros" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "group_name" TEXT NOT NULL DEFAULT 'Ungrouped',
    "ord" INTEGER NOT NULL DEFAULT 0,
    "run_on_agent" BOOLEAN NOT NULL DEFAULT false,
    "agent_hostname" TEXT NOT NULL DEFAULT '',
    "commands" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "macro_groups" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ord" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "macro_id" INTEGER NOT NULL,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "triggered_by" TEXT DEFAULT 'user',
    CONSTRAINT "history_macro_id_fkey" FOREIGN KEY ("macro_id") REFERENCES "macros" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "macro_id" INTEGER NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedules_macro_id_fkey" FOREIGN KEY ("macro_id") REFERENCES "macros" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "server_agents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hostname" TEXT NOT NULL,
    "ip_address" TEXT,
    "cpu_usage" REAL,
    "memory_total" INTEGER,
    "memory_used" INTEGER,
    "last_seen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT,
    "update_requested" BOOLEAN NOT NULL DEFAULT false,
    "restart_requested" BOOLEAN NOT NULL DEFAULT false,
    "network_sent" INTEGER NOT NULL DEFAULT 0,
    "network_recv" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "scraped_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL DEFAULT '141jav',
    "title" TEXT NOT NULL,
    "image_url" TEXT,
    "magnet_link" TEXT NOT NULL,
    "torrent_link" TEXT,
    "tags" TEXT,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_downloaded" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "scraped_item_files" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scraped_item_id" INTEGER NOT NULL,
    "magnet_link" TEXT NOT NULL,
    "file_size" TEXT,
    "seeds" INTEGER NOT NULL DEFAULT 0,
    "leechers" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scraped_item_files_scraped_item_id_fkey" FOREIGN KEY ("scraped_item_id") REFERENCES "scraped_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "file_checks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_path" TEXT NOT NULL,
    "last_checked" DATETIME,
    "broken_count" INTEGER NOT NULL DEFAULT 0,
    "is_ignored" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "nzb_files" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_dir" BOOLEAN NOT NULL DEFAULT false,
    "parent_path" TEXT NOT NULL DEFAULT '',
    "link_target" TEXT,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "debrid_files" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_dir" BOOLEAN NOT NULL DEFAULT false,
    "parent_path" TEXT NOT NULL DEFAULT '',
    "link_target" TEXT,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "scrape_results" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT,
    "magnet_link" TEXT,
    "torrent_link" TEXT,
    "unique_key" TEXT NOT NULL,
    "info_hash" TEXT,
    "file_size" TEXT,
    "tags" TEXT,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_downloaded" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT
);

-- CreateTable
CREATE TABLE "configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "config_json" TEXT NOT NULL DEFAULT '{}',
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "macro_groups_name_key" ON "macro_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "server_agents_hostname_key" ON "server_agents"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "scraped_items_magnet_link_key" ON "scraped_items"("magnet_link");

-- CreateIndex
CREATE UNIQUE INDEX "scraped_item_files_scraped_item_id_magnet_link_key" ON "scraped_item_files"("scraped_item_id", "magnet_link");

-- CreateIndex
CREATE UNIQUE INDEX "file_checks_file_path_key" ON "file_checks"("file_path");

-- CreateIndex
CREATE UNIQUE INDEX "nzb_files_path_key" ON "nzb_files"("path");

-- CreateIndex
CREATE INDEX "nzb_files_parent_path_idx" ON "nzb_files"("parent_path");

-- CreateIndex
CREATE INDEX "nzb_files_name_idx" ON "nzb_files"("name");

-- CreateIndex
CREATE UNIQUE INDEX "debrid_files_path_key" ON "debrid_files"("path");

-- CreateIndex
CREATE INDEX "debrid_files_parent_path_idx" ON "debrid_files"("parent_path");

-- CreateIndex
CREATE INDEX "debrid_files_name_idx" ON "debrid_files"("name");

-- CreateIndex
CREATE UNIQUE INDEX "scrape_results_unique_key_key" ON "scrape_results"("unique_key");
