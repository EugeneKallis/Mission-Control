# Plan: Finish the Remaining Placeholder Scripts

## Context

Mission Control's `scripts/` tree has 6 placeholder scripts that are banner-only stubs. After review, **4 of them will be deleted** (not needed) and **2 will be implemented**. The original sources for both implementations exist at `/Users/ponzi/dev/ServerTool/`. The existing lib clients (`ArrClient`, `PlexClient`) need a few new methods to support `plex-to-arr`.

## Decisions

**Delete** (script + all references):
- `scripts/util/realdebrid-migrate.ts` — not needed
- `scripts/media/cinesync-cleanup.ts` — not needed; CineSyncClient has no other consumers, so delete it too
- `scripts/plex/plex-comparer.ts` — not needed
- `scripts/plex/plex-recent-requester.ts` — not needed

**Implement**:
- `scripts/util/github-release.ts` — port from `ServerTool/scripts/github_release.py`, pull repo list from that source
- `scripts/plex/plex-to-arr.ts` — port from `ServerTool/scripts/plex_to_arr.py`

---

## Phase 1: Delete 4 Scripts + Dead Client

### 1a. Delete script files
- `scripts/util/realdebrid-migrate.ts`
- `scripts/media/cinesync-cleanup.ts`
- `scripts/plex/plex-comparer.ts`
- `scripts/plex/plex-recent-requester.ts`

### 1b. Delete CineSyncClient (only consumer was cinesync-cleanup)
- `src/lib/clients/cinesync.ts`
- `src/lib/clients/cinesync.test.ts`

### 1c. Clean up references in AGENTS.md
Remove these lines:
- Line 423: `cinesync-cleanup.ts # (placeholder — needs CineSync client work)`
- Line 426: `plex-comparer.ts # (placeholder)`
- Line 427: `plex-recent-requester.ts # (placeholder — needs TVMaze/SkyHook)`
- Line 435: `realdebrid-migrate.ts # (placeholder)`
- Lines 471-482: The entire "Deferred scripts (placeholder files)" table

### 1d. Clean up references in docs/SERVERTOOL_MIRROR_PLAN.md
- Line 267: Remove `realdebrid_migrate` mention
- Lines 871-872: Remove `cinesync_cleanup` bullet
- Lines 885-887: Remove `plex_comparer` bullet
- Lines 888-894: Remove `plex_recent_requester` bullet
- Lines 907-908: Remove `realdebrid_migrate` bullet

### 1e. Clean up stale comment in `src/lib/clients/real-debrid.ts`
Line 50: Remove the comment `// ── Torrent API methods (used by realdebrid_migrate) ─────────────────` — replace with a generic section header.

- [ ] Delete 4 script files
- [ ] Delete CineSyncClient + test
- [ ] Remove all references from AGENTS.md
- [ ] Remove all references from SERVERTOOL_MIRROR_PLAN.md
- [ ] Fix stale comment in real-debrid.ts

---

## Phase 2: Client Extensions (for plex-to-arr)

### 2a. `ArrClient` — add 3 methods
**File:** `src/lib/clients/arr.ts`

| Method | Endpoint | Used by |
|--------|----------|---------|
| `listQualityProfiles()` | `GET /qualityprofile` | plex-to-arr (profile selection by name) |
| `listRootFolders()` | `GET /rootfolder` | plex-to-arr (root folder path) |
| `lookupMovie(term)` | `GET /movie/lookup?term=` | plex-to-arr (movie lookup + anime genre detection) |

Add response interfaces: `QualityProfile { id, name }`, `RootFolder { path }`, `MovieLookupResponse { title, tmdbId, genres, images }`.

The existing `lookupSeries()`, `addSeries()`, `addMovie()`, `listMovies()`, `listSeries()` methods are already sufficient for the rest.

### 2b. New `TVMaze` helper
**File:** `src/lib/clients/tvmaze.ts`

Single exported function `isAnime(tvdbId: number): Promise<boolean>` that calls `http://api.tvmaze.com/lookup/shows?thetvdb={id}` and checks:
1. `"Anime"` in genres → true
2. `type === "Animation"` + country === `"Japan"` (network or webChannel) → true
3. Otherwise → false

This is a standalone function, not a full client class. Include test file `tvmaze.test.ts`.

### 2c. Update tests
**File:** `src/lib/clients/arr.test.ts`

Add test cases for `listQualityProfiles`, `listRootFolders`, `lookupMovie` following the existing `installFetch` pattern.

- [ ] Add 3 methods + types to `ArrClient`
- [ ] Create `src/lib/clients/tvmaze.ts` + test
- [ ] Add tests for new ArrClient methods
- [ ] Run `bun test src/lib/clients/` — all pass

---

## Phase 3: Implement `github-release.ts`

**Source:** `ServerTool/scripts/github_release.py` (70 lines)
**File:** `scripts/util/github-release.ts`

Straight port. The repo list is pulled from the Python source:
```
REPOS = [
    {"repo": "homebridge/homebridge"},
    {"repo": "moghtech/komodo"},
    {"repo": "n8n-io/n8n"},
    {"repo": "timothymiller/cloudflare-ddns"},
    {"repo": "NginxProxyManager/nginx-proxy-manager"},
    {"repo": "gethomepage/homepage"},
    {"repo": "dmunozv04/iSponsorBlockTV"},
]
```

Logic:
1. Parse `--hours` (default 24)
2. For each repo: `GET https://api.github.com/repos/{repo}/releases/latest`
3. Filter by `published_at` within the hours window
4. Output JSON array of `{ repo, url, tag, date }`

Uses `parseArgs`, `banner`, `info` from `scripts/_lib/`. No new client needed — direct `fetch()` calls to `api.github.com`. Add test `github-release.test.ts` mocking fetch.

- [ ] Port the script with repo list from ServerTool
- [ ] Add test
- [ ] `just script scripts/util/github-release.ts -- 24` runs and outputs JSON

---

## Phase 4: Implement `plex-to-arr.ts`

**Source:** `ServerTool/scripts/plex_to_arr.py` (627 lines)
**File:** `scripts/plex/plex-to-arr.ts`

Syncs Plex Continue Watching + Watchlist RSS → Sonarr/Radarr with anime detection.

### Flow
1. Fetch Continue Watching from Plex (`PlexClient.getContinueWatching()`)
2. Fetch Watchlist RSS (parse XML for `tvdb://` IDs, keywords, categories)
3. Deduplicate into shows + movies maps (CW takes priority, RSS fills gaps)
4. Fetch quality profiles + root folders from Sonarr/Radarr (new `ArrClient` methods)
5. For each show: check if in Sonarr (`lookupSeries`), if not → add with anime detection
6. For each movie: check if in Radarr (`lookupMovie`), if not → add with genre-based anime detection
7. Cache results to `.plex-to-arr-cache.json` to avoid re-checking

### Anime detection (extract as helper in the script)
1. `seriesType === "anime"` → anime
2. `"Anime"` in genres → anime
3. `"anime"` in Plex keywords → anime
4. TVMaze fallback: `isAnime(tvdbId)` → anime

### Config
Uses `getConfig()` for Arr instances. The Python script hardcodes Sonarr/Radarr URLs + keys + profile names — the TS port reads from `AppConfig.arrInstances` instead, matching the pattern in `scripts/arr/sonarr-sync.ts`.

Profile name constants (from Python source):
- Sonarr default: `"WEB-1080p (Alternative)"`
- Sonarr anime: `"[Anime] Remux-1080p"`
- Radarr default: `"HD Bluray + WEB"`
- Radarr anime: `"[Anime] Remux-1080p"`

Root folder paths: fetched from Arr API (`listRootFolders()`) with fallback to config.

### Flags
- `--dry-run` (default: false) — log only, no API writes
- `--clean-cache` — delete `.plex-to-arr-cache.json` before running

### Env
`PLEX_TOKEN`, `PLEX_URL`, `PLEX_WATCHLIST_RSS` (all in existing config schema).

Add test `plex-to-arr.test.ts` following the `captureFetch` / `mock.module` pattern from `scripts/arr/sonarr-sync.test.ts`.

- [ ] Port the script with cache support
- [ ] Add test
- [ ] `just script scripts/plex/plex-to-arr.ts -- --dry-run` works

---

## Phase 5: Documentation Update

### 5a. Update `AGENTS.md`
- Remove placeholder annotations from the scripts tree listing (done in Phase 1c)
- Remove the deferred scripts table (done in Phase 1c)
- Add `github-release.ts` and `plex-to-arr.ts` to the completed scripts list
- Remove CineSync client from the lib clients list

### 5b. Update `docs/SERVERTOOL_MIRROR_PLAN.md`
- Remove deleted script entries (done in Phase 1d)
- Mark `github-release` and `plex-to-arr` items as complete

- [ ] Update AGENTS.md (script list + client list)
- [ ] Update SERVERTOOL_MIRROR_PLAN.md

---

## Files to Modify

| File | Action |
|------|--------|
| `scripts/util/realdebrid-migrate.ts` | **Delete** |
| `scripts/media/cinesync-cleanup.ts` | **Delete** |
| `scripts/plex/plex-comparer.ts` | **Delete** |
| `scripts/plex/plex-recent-requester.ts` | **Delete** |
| `src/lib/clients/cinesync.ts` | **Delete** |
| `src/lib/clients/cinesync.test.ts` | **Delete** |
| `src/lib/clients/real-debrid.ts` | Fix stale comment referencing realdebrid_migrate |
| `src/lib/clients/arr.ts` | Add 3 methods + types |
| `src/lib/clients/arr.test.ts` | Add tests for new methods |
| `src/lib/clients/tvmaze.ts` | **New** — `isAnime()` helper |
| `src/lib/clients/tvmaze.test.ts` | **New** — test |
| `scripts/util/github-release.ts` | Replace stub with port |
| `scripts/util/github-release.test.ts` | **New** — test |
| `scripts/plex/plex-to-arr.ts` | Replace stub with port |
| `scripts/plex/plex-to-arr.test.ts` | **New** — test |
| `AGENTS.md` | Remove deferred table, placeholder annotations, CineSync client |
| `docs/SERVERTOOL_MIRROR_PLAN.md` | Remove deleted entries, mark implemented ones complete |

## Reuse

- `scripts/_lib/cli.ts` → `parseArgs()` for all scripts
- `scripts/_lib/log.ts` → `banner`, `info`, `warn`, `error`, `summary`
- `scripts/_lib/test-fetch.ts` → `captureFetch` for test mocking
- `src/lib/config.ts` → `getConfig()` for env-based config (Arr instances, Plex, paths)
- `src/lib/clients/arr.ts` → `ArrClient` for all Sonarr/Radarr calls
- `src/lib/clients/plex.ts` → `PlexClient` for Plex API (`getContinueWatching`, `getWatchlist`)
- `scripts/arr/sonarr-sync.ts` → reference for multi-instance Arr pattern + test structure
- `scripts/plex/trakt-exporter.ts` → reference for env-based config + file output pattern

## Steps

- [ ] **Phase 1a:** Delete 4 placeholder script files
- [ ] **Phase 1b:** Delete CineSyncClient + test (no other consumers)
- [ ] **Phase 1c:** Remove all references from AGENTS.md (deferred table, placeholder annotations)
- [ ] **Phase 1d:** Remove all references from SERVERTOOL_MIRROR_PLAN.md
- [ ] **Phase 1e:** Fix stale comment in real-debrid.ts
- [ ] **Phase 2a:** Add `listQualityProfiles`, `listRootFolders`, `lookupMovie` to `ArrClient` + types + tests
- [ ] **Phase 2b:** Create `src/lib/clients/tvmaze.ts` with `isAnime()` + test
- [ ] **Phase 3:** Port `github-release.ts` from Python source (repo list from ServerTool) + test
- [ ] **Phase 4:** Port `plex-to-arr.ts` from Python source (CW + RSS → Sonarr/Radarr + anime detection + cache) + test
- [ ] **Phase 5:** Update AGENTS.md + SERVERTOOL_MIRROR_PLAN.md

## Verification

1. **Type-check:** `just typecheck` (runs `bun tsc --noEmit` for both tsconfig + tsconfig.scripts)
2. **Tests:** `bun test` — all existing + new tests pass
3. **Script smoke tests (dry-run):**
   - `just script scripts/util/github-release.ts -- 24`
   - `just script scripts/plex/plex-to-arr.ts -- --dry-run`
4. **No remaining placeholders:** `rg -n 'placeholder|DEFERRED' scripts/ AGENTS.md` returns nothing relevant
5. **No dangling references:** `rg -n 'cinesync|CineSync|realdebrid-migrate|plex-comparer|plex-recent-requester' scripts/ src/ AGENTS.md docs/` returns nothing (except maybe plan doc historical mentions)
