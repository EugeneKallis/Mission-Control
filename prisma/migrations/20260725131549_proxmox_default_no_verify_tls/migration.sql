-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_proxmox_endpoints" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "api_url" TEXT NOT NULL,
    "api_token" TEXT NOT NULL,
    "verify_tls" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_proxmox_endpoints" ("api_token", "api_url", "created_at", "enabled", "id", "name", "order", "updated_at", "verify_tls") SELECT "api_token", "api_url", "created_at", "enabled", "id", "name", "order", "updated_at", "verify_tls" FROM "proxmox_endpoints";
DROP TABLE "proxmox_endpoints";
ALTER TABLE "new_proxmox_endpoints" RENAME TO "proxmox_endpoints";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
