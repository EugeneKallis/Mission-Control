# Mission Control — Helpful Feature Backlog

## Status

- **Purpose:** A ranked backlog of small, independently shippable features that could help with daily life or homelab operations.
- **Implementation rule:** Pick **one checkbox only**, finish its MVP and acceptance checks, then reassess the ranking before starting another.
- **Safety rule:** New server integrations are read-only by default. Restarts, deletes, deploys, restores, and configuration changes require explicit confirmation and an audit record.
- **Sizing:** `S` = roughly 1 focused day, `M` = 2–4 days, `L` = 5+ days.

## Research Basis

The backlog was checked against the current app surface, database schema, workers, scripts, recent commits, and Eugene's homelab topology in `/root/dev/pi-agent/skills/server/SKILL.md`.

Important existing capabilities that should not be rebuilt:

- Proxmox node, VM, LXC, and storage snapshots with threshold alerts and guest restart actions.
- Log alerts, broken-link alerts, energy-price alerts, macro history, worker timers, schedules, and scheduled Pi tasks.
- NZB/Debrid file viewers, Arr configuration, Plex/Arr scripts, scraper workers, and database inspection.
- Uptime Kuma for endpoint monitoring and Komodo as the source of truth for Docker deployments.

## Priority Summary

| Order | Feature | Main benefit | Size | Dependency |
|---:|---|---|:---:|---|
| 0 | Mission Control access gate | Protects secrets and destructive controls | M | Conditional urgency |
| 1 | Automation watchdog | Notices failed, stuck, or silent scheduled work | S–M | None |
| 2 | Proxmox backup assurance | Answers “can I recover?” rather than only “is it up?” | M | Proxmox API |
| 3 | Arr queue triage | Finds stalled or failed media downloads quickly | M | Existing Arr config |
| 4 | Telegram incident digest | Brings important alerts to the phone | M | Telegram bot token/chat ID |
| 5 | Personal agenda card | Puts the next 48 hours beside server work | M | Private iCalendar URL |
| 6 | Severe-weather alerts | Gives advance warning for personal and server risk | S | Location setting |
| 7 | Capacity history and forecast | Prevents storage exhaustion | L | Existing PVE snapshots |
| 8 | Dependency-aware incident view | Groups symptoms under likely shared causes | M–L | Read-only probes |
| 9 | UPS/power readiness | Shows runtime and power-loss state | M | A NUT-compatible UPS |
| 10 | Komodo update inbox | Reviews available updates without configuration drift | S–M | Komodo API key |
| 11 | Read-only diagnostic snapshot | Produces a safe incident bundle for Pi/chat | M | SSH/probe configuration |

---

## 0. Mission Control Access Gate

- [ ] **Implement Mission Control access gate**

**Build first if:** Mission Control is reachable outside a tightly trusted LAN/VLAN. The app exposes API keys, database content, arbitrary macros, Pi tools, and guest restart controls.

**MVP**

- Require one server-side configured credential for every page and API route except static assets and a minimal health endpoint.
- Use an `httpOnly`, `secure`, `sameSite=strict` session cookie.
- Add explicit confirmation text for restart/delete/run actions.
- Record actor, action, target, result, and timestamp for mutating operations.

**Acceptance checks**

- An unauthenticated request cannot read `/api/config`, browse the database, run a macro, send Pi commands, or restart a guest.
- Authentication cannot be bypassed by calling an API route directly.
- Secrets are never returned in the login response or written to logs.

**Keep out of the MVP**

- User accounts, roles, OAuth, passkeys, and remote identity-provider integration. Add those only if one shared operator credential becomes inadequate.

---

## 1. Automation Watchdog

- [ ] **Implement automation watchdog**

**Why it helps:** Mission Control can schedule macros, worker timers, and agent tasks, but the operator still has to inspect separate pages to notice that something failed, stayed `running`, or simply stopped firing.

**MVP**

- Add one `/api/automation/health` aggregate over existing `Schedule`, `WorkerTimer`, `AgentTask`, and `History` data.
- Flag:
  - latest run failed;
  - a run has remained `running` beyond its timeout/ceiling;
  - an enabled timer or task has never run;
  - an enabled item is overdue relative to its cron schedule.
- Add an **Automation** badge and a compact attention list linking to the existing schedule/task/history pages.
- Reuse existing history rows and `lastRunAt`/`lastStatus`; add no new table for the first version.

**Acceptance checks**

- Each flagged item states the exact reason and last known run time.
- Disabled schedules/tasks never create alerts.
- A successful subsequent run clears the alert without manual database edits.

**Keep out of the MVP**

- Automatic retries. First make failures visible; retry policy can otherwise amplify a bad job.

---

## 2. Proxmox Backup Assurance

- [ ] **Implement Proxmox backup assurance**

**Why it helps:** Current monitoring answers whether guests are healthy now. It does not answer whether every important VM/LXC has a recent recoverable backup.

**MVP**

- Extend the existing Proxmox client with read-only backup inventory/job reads.
- Show every VM/LXC with:
  - newest backup timestamp;
  - age and storage location;
  - covered/uncovered state;
  - stale threshold, configurable globally at first.
- Show failed or missing scheduled backup jobs when the API exposes enough information.
- Add a manual **restore drill verified** date and reminder. Do not perform restores from Mission Control.

**Acceptance checks**

- An important guest with no backup is impossible to miss.
- Offline Proxmox endpoints produce an “unknown” state, not a false “no backups” state.
- The feature performs no backup, prune, or restore mutation.

**Keep out of the MVP**

- Creating backup jobs, changing retention, pruning backups, or automated restore tests.

**Primary source:** Proxmox documents scheduled backup jobs, retention settings, and the `/cluster/backup` API surface; it also explicitly treats backups as a requirement for sensible deployments. [Proxmox Backup and Restore](https://pve.proxmox.com/wiki/Backup_and_Restore)

---

## 3. Arr Queue Triage

- [ ] **Implement Arr queue triage**

**Why it helps:** Ten built-in Radarr/Sonarr instances are already configured, but there is no single place to see stalled, failed, warning, or long-running queue items across all of them.

**MVP**

- Add read-only queue methods to `src/lib/clients/arr.ts`.
- Fan out through the canonical Arr instance definitions and effective config.
- Display only actionable items by default: failed, warning, stalled beyond a threshold, or missing a download client.
- Group by instance and provide deep links to the native Sonarr/Radarr item or queue page.
- Add a sidebar badge for actionable item count.

**Acceptance checks**

- One failing instance does not hide healthy responses from the other nine.
- API keys remain server-side and errors never include key values.
- The first release cannot remove, retry, or blocklist downloads.

**Keep out of the MVP**

- SABnzbd, Decypharr, and qBittorrent mutation controls. Add one downstream system only after the read-only Arr view proves useful.

---

## 4. Telegram Incident Digest

- [ ] **Implement Telegram incident digest**

**Why it helps:** Mission Control has several useful badges, but they require opening the site. The server skill identifies Telegram as the active alert channel for n8n scripts, so this uses an existing habit rather than introducing another app.

**MVP**

- Add `telegram_bot_token` and `telegram_chat_id` server-side config values, masked in API responses.
- Send one scheduled daily digest containing only actionable items from existing sources:
  - automation watchdog failures;
  - Proxmox threshold alerts;
  - unresolved log alerts;
  - broken-link count;
  - better energy offers.
- Send immediate messages only for a short allowlist of high-severity events.
- Persist a fingerprint/watermark so the same incident is not sent repeatedly.
- Include links back to the relevant Mission Control page.

**Acceptance checks**

- A test-message button verifies configuration.
- Repeated polling does not send duplicate alerts.
- Telegram failure never breaks the monitored worker or route.

**Keep out of the MVP**

- Two-way bot commands and chat-driven server mutations.

**Primary source:** Telegram's HTTP Bot API provides `sendMessage` with a required `chat_id`, text payload, optional formatting, and a 4096-character message limit. [Telegram Bot API — sendMessage](https://core.telegram.org/bots/api#sendmessage)

---

## 5. Personal Agenda Card

- [ ] **Implement personal agenda card**

**Why it helps:** Mission Control is already a daily control surface. A small “next 48 hours” card makes it useful before there is a server problem and can include appointments, bills, trash day, maintenance windows, or deliveries from an existing calendar.

**MVP**

- Configure one private, read-only `.ics` feed URL.
- Show the next 48 hours of events with start time, summary, and location.
- Cache the feed briefly and retain the last successful result when the feed is temporarily unavailable.
- Keep the feed URL server-side and mask it in config responses.

**Acceptance checks**

- All-day and timed events display in the configured local timezone.
- Private feed credentials never reach client JavaScript or logs.
- Fetch failures show staleness rather than an empty agenda.

**Keep out of the MVP**

- Calendar writes, invitations, multiple accounts, task management, and a full month view.

**Primary source:** iCalendar standardizes `VEVENT` data such as `DTSTART`, `DTEND`, `SUMMARY`, and `LOCATION`, making a read-only feed a portable integration seam. [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)

---

## 6. Severe-Weather Alerts

- [ ] **Implement severe-weather alerts**

**Why it helps:** Severe weather affects travel, appointments, power, networking, and server availability. This is a small feature with both personal and infrastructure value.

**MVP**

- Add latitude/longitude and state settings.
- Poll active NWS alerts and show only alerts relevant to the configured area.
- Display severity, urgency, expiry, headline, and official instructions.
- Add a sidebar badge for active severe/extreme alerts.
- Optionally include the alert in the Telegram digest after Feature 4 exists.

**Acceptance checks**

- Expired alerts disappear automatically.
- API requests send the required identifying `User-Agent`.
- A failed NWS request shows stale/unknown status rather than “no alerts.”

**Keep out of the MVP**

- Radar maps, custom forecasting, historical weather storage, and utility outage scraping.

**Primary source:** NWS supports active-alert filtering (including state filters) and point-to-forecast discovery; it requires an identifying `User-Agent`. [NWS API Web Service](https://www.weather.gov/documentation/services-web-api)

---

## 7. Capacity History and Forecast

- [ ] **Implement capacity history and forecast**

**Why it helps:** Thresholds reveal a disk that is already full. Trends reveal which pool, VM, or cache is likely to fill next week.

**MVP**

- Persist one hourly sample for existing Proxmox node/storage totals and selected guest disk usage.
- Keep 90 days with daily compaction after the first week.
- Show 24-hour, 7-day, and 30-day sparklines.
- Estimate “days to threshold” only when growth is consistently positive; otherwise show no forecast.
- Start with Proxmox data already fetched by `getClusterSnapshot()`.

**Acceptance checks**

- Sampling reuses the cached snapshot and does not multiply Proxmox traffic.
- Retention is bounded and cleanup is tested.
- Missing samples create gaps, not fabricated zeroes.

**Keep out of the MVP**

- Docker, Unraid, rclone cache, network throughput, and predictive modeling. Add each source only after PVE history is useful.

**Possible later source:** Docker exposes a versioned REST Engine API that can be called directly from an HTTP client if container-level stats are later needed. [Docker Engine API](https://docs.docker.com/reference/api/engine/)

---

## 8. Dependency-Aware Incident View

- [ ] **Implement dependency-aware incident view**

**Why it helps:** The homelab has shared failure domains. For example, simultaneous rclone and NFS/WebDAV symptoms can point to Unraid (`192.168.1.99`) rather than several unrelated service failures.

**MVP**

- Encode a small, explicit topology registry for only the important dependencies:
  - Proxmox master/slave;
  - CT 111/main Docker host;
  - Unraid and its SABnzbd/Decypharr/NZBDav services;
  - rclone mounts;
  - Plex;
  - AdGuard DNS;
  - Uptime Kuma and Komodo.
- Run read-only HTTP/TCP probes and consume existing PVE status.
- Group failed leaves under a failed shared dependency.
- Present evidence as “likely shared cause,” never as certainty.

**Acceptance checks**

- If Unraid is unreachable, dependent failures are grouped rather than producing a wall of unrelated alerts.
- Probes have strict timeouts and cannot stall a page request.
- No Docker restart, mount restart, or SSH mutation is exposed.

**Keep out of the MVP**

- Automatic remediation, generic graph editors, service discovery, and replacing Uptime Kuma. This view explains dependencies; Kuma remains the endpoint monitor.

**Local source:** `/root/dev/pi-agent/skills/server/SKILL.md` documents the topology, shared Unraid dependency, and diagnose-only operating rules.

---

## 9. UPS / Power Readiness

- [ ] **Implement UPS/power readiness** *(only if a compatible UPS is present)*

**Why it helps:** A UPS dashboard can show whether the homelab is protected before an outage and whether battery runtime is enough during one.

**MVP**

- Read one Network UPS Tools endpoint.
- Show line/on-battery state, battery charge, estimated runtime, load, and last state change when available.
- Alert on on-battery, low battery, replace-battery, or lost communication states.
- Keep shutdown behavior in NUT/Proxmox configuration, not in the web app.

**Acceptance checks**

- Mission Control remains read-only toward the UPS.
- Lost NUT connectivity is distinct from “utility power failed.”
- No shutdown command exists in the first release.

**Keep out of the MVP**

- Outlet switching, automatic host shutdown, and vendor-specific integrations.

**Primary source:** NUT's `upsmon`/`upssched` flow supports timed handling of events such as running on battery and restoration of power. [Network UPS Tools — advanced usage](https://networkupstools.org/docs/user-manual.chunked/ar01s07.html)

---

## 10. Komodo Update Inbox

- [ ] **Implement Komodo update inbox**

**Why it helps:** It provides one read-only list of available container-image updates while preserving Komodo as the deployment source of truth.

**MVP**

- Use a read-only Komodo API key.
- List stacks/deployments that report an available image update.
- Show current image/tag and a link to Komodo.
- Do not deploy from Mission Control.

**Acceptance checks**

- No compose files are edited and no direct `docker pull` occurs.
- API credentials are masked and server-side only.
- Komodo being offline does not affect other Mission Control pages.

**Keep out of the MVP**

- Auto-update, batch deploy, and duplicate procedure scheduling. Komodo already owns those capabilities.

**Primary sources:** Komodo exposes an authenticated RPC-like API with a TypeScript client, and its native “Poll for Updates” mode can report newer image digests without redeploying. [Komodo API and Clients](https://komo.do/docs/ecosystem/api) · [Komodo Automatic Updates](https://komo.do/docs/deploy/auto-update)

---

## 11. Read-Only Diagnostic Snapshot

- [ ] **Implement read-only diagnostic snapshot**

**Why it helps:** When something breaks, a consistent evidence bundle saves time and gives Pi/chat enough context without granting it automatic remediation powers.

**MVP**

- Add a manually triggered diagnostic run that collects bounded output from approved checks:
  - app/process uptime;
  - PVE endpoint and guest state;
  - CT 111 disk/RAM and Docker health summary;
  - Unraid Docker API reachability;
  - rclone service/mount checks on both PVE nodes;
  - recent Mission Control service errors.
- Store the sanitized transcript in `History` and provide a **Send to Pi chat** action.
- Redact tokens, credentials, URLs containing secrets, and environment values.

**Acceptance checks**

- Every command/probe is allowlisted and read-only.
- Each step has a timeout and partial results survive individual failures.
- The transcript contains no API keys or bot tokens.

**Keep out of the MVP**

- Restarts, `kill`, mount recovery, package updates, and free-form remote shell input.

**Local source:** The approved read-only probes and critical cautions are documented in `/root/dev/pi-agent/skills/server/SKILL.md`.

---

## Recommended First Pick

Start with **Automation Watchdog** unless the app is exposed outside a trusted network, in which case start with **Mission Control Access Gate**.

Automation Watchdog is the best first normal feature because it:

1. reuses existing tables and UI destinations;
2. needs no new external credentials or server privileges;
3. improves every existing scheduler at once;
4. creates the actionable incident feed later features can send to Telegram.

## Ideas Deliberately Not Recommended

| Idea | Why not build it now |
|---|---|
| Another generic server-status page | Proxmox and Uptime Kuma already own raw status. Prefer backup assurance or dependency explanation. |
| A second scheduler | Macro schedules, worker timers, agent tasks, Komodo procedures, and n8n already cover scheduling. |
| Direct Docker update/restart controls | They would drift from Komodo's declared state and violate the server operating rules. |
| Automatic rclone recovery | Restarting rclone can detach LXC bind mounts; diagnosis must remain separate from remediation. |
| A custom notification app | Telegram is already used operationally; send high-value alerts there instead. |
| A broad Home Assistant clone | Too much scope. Add one focused life feature—agenda or weather—and keep Mission Control deep rather than wide. |

## Re-Ranking Checklist

After completing any item, reassess the remaining list using:

1. Did this remove a recurring manual check?
2. Did it prevent or shorten a real incident?
3. Does another existing tool already solve the problem better?
4. Can the next MVP remain read-only and independently useful?
5. Will it be used weekly? If not, defer it.
