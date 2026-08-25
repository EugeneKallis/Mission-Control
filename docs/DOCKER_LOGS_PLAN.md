# Docker Logs — Implementation Plan

Status: **implemented**
Decision record: `docs/adr/0001-docker-logs-browser-merge-via-passthrough.md`
Glossary: `CONTEXT.md` — Docker Logs, Log Viewer, Dozzle Endpoint, Instance, Backfill

## Goal

A "Docker Logs" page at `/docker-logs` (nav under **Monitoring**) that merges container
lists and live logs from multiple configurable Dozzle instances, separated by instance.
Native Mission Control UI (no iframe), browser-side merge, stateless MC pass-through
routes. LAN-only, auth disabled.

## Verified upstream facts (Dozzle v10.7.1 + v10.7.2, probed live 2026-08-17)

| Fact | Detail |
| ---- | ------ |
| Endpoints | `http://192.168.1.111:8080` (host UUID `c63d1444-43b1-414c-bf7a-3bbf5064e302`), `http://192.168.1.99:8080` (host UUID `b3810efe-9a06-4591-bec0-d505a0c69da9`) |
| CORS | **None.** No `Access-Control-Allow-Origin` on any route → browser-direct EventSource/fetch is blocked; pass-through routes are mandatory (ADR 0001) |
| Container list | `GET /api/events/stream` (SSE): `server-version`, `containers-changed` (full list incl. `stats[]`, sent on connect and on start/rename/reconnect), `container-stat`, `container-event`, `container-health`, `update-host`. Payload keys lowercase: `id, name, image, state, host, stats[]{cpu (fraction), memory (fraction), memoryUsage (bytes)}` |
| Log tail | `GET /api/hosts/{host}/containers/{id}/logs/stream?stdout&stderr&levels=…` (SSE). **Requires** `stdout`/`stderr` AND all seven canonical levels (`trace,debug,info,warn,error,fatal,unknown`) to avoid Dozzle's filtered-backfill mode; live messages are compact `LogEvent` JSON frames and `:ping` keepalives |
| Backfill | `GET /api/hosts/{host}/containers/{id}/logs?from=&to=&min=N&stdout&stderr&levels=…` (JSONL). Dozzle widens the date range until N matching lines or the container history is exhausted; its endpoint caps each request at 500 lines, so the 1,000-line option uses two adjacent requests and deduplicates by event id/timestamp |
| Param caps | Stream accepted `min=1000` live; the date-range endpoint caps `min` at 500. 5000 unverified → excluded from ladder |
| Misc | `/api/version` returns HTML `<pre>v10.7.2</pre>`, not JSON. `/healthcheck` = empty 200. Gzip offered on SSE (Accept-Encoding) — pass-through should forward identity or decompress |

## Architecture

```
Browser (one page)                       MC (stateless pipes + CRUD)         Dozzle instances
─────────────────────────────            ────────────────────────────        ─────────────────
EventSource per endpoint ───────────────▶ /api/docker-logs/endpoints/[id]/events/stream ──pipe──▶ /api/events/stream
fetch (backfill) ──────────────────────▶ /api/docker-logs/endpoints/[id]/containers/[cid]/logs ────pipe──▶ /api/hosts/{host}/containers/{cid}/logs
EventSource (opened container) ────────▶ /api/docker-logs/endpoints/[id]/containers/[cid]/logs/stream ─▶ /api/hosts/{host}/containers/{cid}/logs/stream
fetch (endpoint CRUD) ─────────────────▶ /api/docker-logs/endpoints(+/[id])                            (Prisma)
```

- **Merge is client-side**, keyed by `(endpointId, containerId)`. MC holds no snapshot,
  no cache, no scheduler — pipes only, one per open browser connection.
- Pass-through route behavior: look up endpoint URL in DB → forward allowed query params
  (`min, stdout, stderr, levels, filter, inverse` allowlist) → stream upstream body
  through verbatim → on client disconnect abort upstream fetch (`request.signal`) →
  upstream failure = 502 (drives the offline pill).
- Native EventSource auto-reconnect heals dropped instances; Dozzle resends
  `containers-changed` on reconnect. No custom retry logic.

## Decisions (settled in grilling)

1. MC-side merge of independent instances — **not** Dozzle agent federation (ADR 0001).
2. Native page, not iframe; no link-out fallback needed (native).
3. No MC server subscriber/aggregator; no sidebar badge in v1 (contradicts stateless pipes).
4. Backfill = line count: ladder **100 / 300 / 1000**, default **100**. The viewer
   fetches JSONL backfill before/alongside the live stream; the 1,000-line option is
   assembled from two Dozzle requests because each upstream request caps at 500. Live
   buffer cap 5000 lines client-side. Persisted in localStorage
   `mission-control:docker-logs:v1` (with collapsed-sections state).
5. Show CPU% + memory columns (from `stats[]` last sample / `container-stat` events).
6. Offline instance: section header red dot + "unreachable" pill, rows dim to last-known
   state, self-heals via native reconnect.
7. Grouped list — collapsible section per instance; global text filter across instances;
   rows: state dot, name, image, CPU, memory. Manage Instances gear → CRUD modal
   mirroring PVE `endpoint-settings.tsx` (name, URL, enabled, order; no token field).

## Build steps

### Phase A — Foundation
1. **Prisma**: `DozzleEndpoint` model (`id, name, apiUrl, enabled, order`) + migration.
   No seed — user adds instances in the UI.
2. **`src/lib/docker-logs.ts`**: types (`DozzleContainer`, `DozzleStat`, `DozzleLogEvent`,
   `SearchStatus`), URL builders (events stream, log stream with param allowlist), SSE
   line parser (event/data frames, `:ping` skip), pure helpers — all unit-testable.
3. **CRUD routes**: `/api/docker-logs/endpoints` + `/[id]` (PVE mirror, `Cache-Control:
   no-store`, URL validation `http(s)://`).
4. **Pass-through routes**: `endpoints/[id]/events/stream`,
   `endpoints/[id]/containers/[cid]/logs`, and
   `endpoints/[id]/containers/[cid]/logs/stream`. Set `X-Accel-Buffering: no`. Resolve
   container's Dozzle `host` param server-side? — **No**: forward `{host}` as query from
   client (it comes from the merged list) — route builds upstream URL from endpoint +
   `?host=` + `{cid}` path. Reject unknown params. Forward repeated `levels` params and
   default the canonical seven-level set when callers omit it.

### Phase B — UI
5. **`src/components/docker-logs/docker-logs-page.tsx`**: endpoint list fetch → per
   endpoint EventSource through MC route → state map `{containers, latestStats, health,
   connected}`; sections, search, stats columns, offline pill; cleanup on unmount.
6. **Log pane**: click row → glassmorphism modal (MC modal pattern), full-height terminal
   area (`--terminal-*` tokens). Controls: backfill selector, Load more, pause/resume,
   clear, text filter, buffer-cap indicator. States: loading the requested backfill,
   live, paused, empty-exhausted. stderr lines tinted via the compact event's `s` flag;
   timestamps come from `ts`/`id`.
7. **`docker-logs-types.ts`** shared client types. **`endpoint-settings.tsx`** CRUD modal.
8. Sidebar: "Docker Logs" under Monitoring, `/docker-logs`. Page shell `src/app/docker-logs/page.tsx`.

### Phase C — Tests + docs
9. Tests (bun:test, `--isolate`): lib helpers (URL builders, repeated-level query
   construction, compact log decoding), CRUD + pass-through routes with mocked fetch
   (200 pipe, upstream 502, param forwarding), component tests (sections, search,
   offline pill, stats render, backfill selector persistence, log pane states, buffer cap).
10. AGENTS.md: API surface + files table + Phase 16 row. This doc's Status → built.
11. Deploy: existing `just deploy` (migrate + build + restart). No new systemd unit,
    no worker, no timer.

## Open items at build time (verification steps, not decisions)

- Pin the exact compact `LogEvent` rendering against a **chatty** container (the two
  probe subjects were silent — the source confirms fields `ts,m,rm,l,s`, but no positive
  live log line was captured).
- Pin per-line byte cost on a chatty container (buffer sizing sanity).
- Confirm behavior when the same container name exists on both instances (expected: fine,
  keyed by endpoint+id).
