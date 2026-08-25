# 0001 — Docker Logs merges Dozzle instances in the browser via MC pass-through routes

Mission Control's Docker Logs page combines multiple independent Dozzle instances
(currently two on the LAN, auth disabled) by having the browser open one SSE connection
per instance through thin MC pass-through routes that pipe Dozzle's streams unchanged —
rather than federating instances with Dozzle's native agent mode, or maintaining a
server-side aggregation snapshot.

## Considered Options

- **Dozzle agent-mode federation** — rejected: it collapses the two instances into one
  Dozzle, which does not leave each instance's configuration owned and visible per-instance
  inside Mission Control, and couples the feature to a topology change on the Docker hosts.
- **Server-side subscriber + merged snapshot** (PVE pattern) — rejected: no MC-side cache
  or aggregation is needed for a quick-look log viewer; per-open-browser connections are
  sufficient and simpler.
- **Browser-direct to Dozzle URLs** — rejected after live verification: Dozzle sends no
  `Access-Control-Allow-Origin` (verified on v10.7.1 and v10.7.2), so cross-origin
  EventSource/fetch from MC's origin is blocked by the browser. MC pass-through routes
  keep endpoint URLs server-side and leave one place to add credential forwarding later;
  the current endpoint model intentionally stores no Dozzle credentials because auth is
  disabled.

## Consequences

- The merge (containers keyed by endpoint, stats, health) lives entirely in the client
  component; MC routes stay stateless pipes.
- Dozzle upstream changes to the undocumented `/api` SSE payloads surface as client bugs;
  the payload shape for v10.7.x is pinned in the Docker Logs page types.
