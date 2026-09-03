# Operations Dashboard

`/operations` combines five read-mostly operational features:

- deployment/change ledger;
- GitHub release radar;
- AdGuard Home health;
- TLS certificate expiry checks;
- scoped alert maintenance windows.

## Storage

Configuration and check state use the existing `settings` table keys
`operations:config:v1` and `operations:state:v1`. The AdGuard password is stored in SQLite,
matching the project's existing secret-storage model, and is never returned by the API.

Deployment events are append-only JSONL at `/var/lib/mission-control/deployments.jsonl`. Development uses
`.mission-control/` in the repository root; it is gitignored.

## Daily worker

`src/workers/operations-worker.ts` runs daily at 03:00 through the Worker Timer scheduler.
Its default timer is created enabled. It refreshes releases, AdGuard health, and TLS status.

Manual checks are available from `/operations`.


## API

`GET /api/operations` returns the cached snapshot. Add `?refresh=1` for live external checks.
`PUT /api/operations` updates validated configuration. `POST /api/operations` accepts only
the allowlisted actions implemented in the route: refresh, release acknowledgement, and
maintenance-window create/delete.

## Maintenance suppression

Maintenance windows suppress badges, not evidence. Operations alerts are excluded from the
Operations count while their source is active. Proxmox, Log Viewer, BL Finder, and Energy
Prices sidebar badges are hidden when their corresponding source is active. Logs, health
snapshots, and database rows continue to be collected.
