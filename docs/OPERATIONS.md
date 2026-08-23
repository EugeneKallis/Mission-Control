# Operations Dashboard

`/operations` combines six read-mostly operational features:

- verified Mission Control SQLite backups;
- deployment/change ledger;
- GitHub release radar;
- AdGuard Home health;
- TLS certificate expiry checks;
- scoped alert maintenance windows.

## Storage

Configuration and check state use the existing `settings` table keys
`operations:config:v1` and `operations:state:v1`. The AdGuard password is stored in SQLite,
matching the project's existing secret-storage model, and is never returned by the API.

Production backups default to `/var/lib/mission-control/backups`. Deployment events are
append-only JSONL at `/var/lib/mission-control/deployments.jsonl`. Development uses
`.mission-control/` in the repository root; it is gitignored.

## Daily worker

`src/workers/operations-worker.ts` runs daily at 03:00 through the Worker Timer scheduler.
Its default timer is created enabled. It:

1. creates a consistent SQLite copy with `VACUUM INTO`;
2. verifies the copy with `PRAGMA quick_check` and `PRAGMA foreign_key_check`;
3. enforces configured retention;
4. refreshes releases, AdGuard health, and TLS status.

Manual checks and backups are available from `/operations`.

## Restore procedure

Restore remains CLI-only so a running web process cannot replace its own database.

1. Stop Mission Control and its workers:
   ```bash
   systemctl stop mission-control.service mission-control-magnet-bridge.service mission-control-broken-link-checker.service
   ```
2. Select a backup whose dashboard verification is `ok` with zero foreign-key errors.
3. Preserve the current database and sidecars:
   ```bash
   cd /opt/mission-control
   mkdir -p /var/lib/mission-control/restore-rollback
   mv prisma/dev.db* /var/lib/mission-control/restore-rollback/
   cp /var/lib/mission-control/backups/<backup-name>.db prisma/dev.db
   chmod 600 prisma/dev.db
   ```
4. Verify before startup:
   ```bash
   sqlite3 prisma/dev.db 'PRAGMA quick_check; PRAGMA foreign_key_check;'
   ```
   Expected output is one `ok` line and no foreign-key rows.
5. Start the services and verify `/api/hello`, `/operations`, schedules, and recent history:
   ```bash
   systemctl start mission-control.service mission-control-magnet-bridge.service mission-control-broken-link-checker.service
   ```
6. Mark the restore drill verified in `/operations` only after those checks pass.

## API

`GET /api/operations` returns the cached snapshot. Add `?refresh=1` for live external checks.
`PUT /api/operations` updates validated configuration. `POST /api/operations` accepts only
the allowlisted actions implemented in the route: backup, refresh, restore verification,
release acknowledgement, and maintenance-window create/delete.

## Maintenance suppression

Maintenance windows suppress badges, not evidence. Operations alerts are excluded from the
Operations count while their source is active. Proxmox, Log Viewer, BL Finder, and Energy
Prices sidebar badges are hidden when their corresponding source is active. Logs, health
snapshots, and database rows continue to be collected.
