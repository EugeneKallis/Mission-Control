# Mission Control Expansion Plan

This program implements the feature set approved after Phase 18. Ship one vertical slice at a time; each phase must include its data/interface seam, route, UI, tests, documentation, and operational safeguards before the next begins.

## Status

| Phase | Feature | Status |
|---:|---|---|
| 19 | Integration Health Matrix | ✅ Done |
| 20 | Action Audit Trail | ⏳ In progress |
| 21 | Media Pipeline Health | Planned |
| 22 | ZFS and Disk Health | Planned |
| 23 | Pi Incident Copilot | Planned |
| 24 | Notification Rules Engine | Planned |
| 25 | Internet Quality History | Planned |
| 26 | Storage Cleanup Advisor | Planned |
| 27 | Plex/Tautulli Activity | Planned |
| 28 | Global Command Palette | Planned |
| 29 | Arr Configuration Drift | Planned |
| 30 | Runbook Library | Planned |
| 31 | Synthetic Journey Monitor | Planned |
| 32 | Customizable Home Dashboard | Planned |
| 33 | Energy Contract Assistant | Planned |

## Shared configuration foundation

`/admin/config` exposes the static credentials, endpoints, thresholds, retention values,
location, power, and energy inputs required by this roadmap. The canonical field registry
is `src/lib/config-fields.ts`; runtime consumers use `resolveGlobalConfigValues()` for
environment > database > default precedence. Repeatable records stay in feature-owned
interfaces (for example Proxmox endpoints, notification rules, runbooks, and synthetic
journeys).

## Phase 19 — Integration Health Matrix

One read-only surface checks configured Arr, Plex, Real-Debrid, Decypharr, Pulse, Dozzle, Proxmox, and AdGuard integrations. It reports healthy, unreachable/auth failure, or unconfigured without returning credentials or upstream response bodies.

Acceptance:
- checks run concurrently with bounded timeouts;
- one failed integration does not hide the others;
- secrets never appear in responses or errors;
- manual refresh bypasses the short in-process cache;
- desktop and mobile layouts remain usable.

## Remaining phases

### Phase 20 — Action Audit Trail
Persist destructive/configuration actions with actor, target, sanitized input, outcome, and correlation ID. Add filtering and retention controls.

### Phase 21 — Media Pipeline Health
Correlate Prowlarr/indexer, Arr queue, downloader, Decypharr, filesystem, and Plex state into an item-level stalled-stage view.

### Phase 22 — ZFS and Disk Health
Collect pool state, scrub age, SMART failures, temperatures, and replacement urgency from configured hosts.

### Phase 23 — Pi Incident Copilot
Build read-only incident context from active alerts, deploys, logs, and snapshots; ask Pi for a concise diagnosis and investigation plan. Never execute suggested actions automatically.

### Phase 24 — Notification Rules Engine
Route deduplicated alert/recovery events to Telegram, email, and generic webhooks with severity filters, cooldowns, quiet hours, and maintenance suppression.

### Phase 25 — Internet Quality History
Track gateway reachability, DNS latency, packet loss, and optional bounded speed tests with outage correlation.

### Phase 26 — Storage Cleanup Advisor
Report reclaimable storage from stale downloads, old histories, logs, backups, duplicates, and abandoned files. Start read-only; destructive actions remain explicit and confirmed.

### Phase 27 — Plex/Tautulli Activity
Show active streams, transcodes, buffering, recently added media, and library health through an optional Tautulli integration.

### Phase 28 — Global Command Palette
Keyboard search across navigation, macros, guests, containers, history, and safe actions.

### Phase 29 — Arr Configuration Drift
Compare profiles, folders, tags, clients, and naming settings across the canonical Arr registry and display actionable differences.

### Phase 30 — Runbook Library
Store Markdown runbooks and associate them with alerts, integrations, and safe macros.

### Phase 31 — Synthetic Journey Monitor
Exercise critical user journeys and record timing/failure stage rather than relying on endpoint uptime alone.

### Phase 32 — Customizable Home Dashboard
Persist an ordered, responsive selection of existing status cards. Reuse current data sources rather than adding parallel polling.

### Phase 33 — Energy Contract Assistant
Use existing rate history plus user-entered usage/contract dates to estimate switching savings and renewal reminders.
