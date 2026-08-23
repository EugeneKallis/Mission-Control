# Mission Control — New Feature Research (2026-08-23)

> **Status:** All six candidates were implemented in Phase 18. See `docs/OPERATIONS.md`.

## Scope

This round looked for useful additions **not already listed** in
`docs/FEATURE_IDEAS_BACKLOG.md`. It was checked against the current pages, API groups,
Prisma schema, deployment script, and existing GitHub release utility.

Existing ownership boundaries still apply:

- Uptime Kuma remains the endpoint monitor.
- Komodo remains the Docker deployment source of truth.
- Proxmox remains the virtualization control plane.
- Mission Control should aggregate evidence and expose read-only integrations before
  adding mutations.

Sizing: `S` = about one focused day, `M` = 2–4 days, `L` = 5+ days.

## Ranked New Candidates

| Rank | Feature | Value | Size | Recommendation |
|---:|---|---|:---:|---|
| 1 | Mission Control disaster-recovery center | Protects the control plane's own data | M | Add to main backlog |
| 2 | Deployment and change ledger | Makes “what changed?” answerable during incidents | S–M | Add to main backlog |
| 3 | Release radar | Turns an existing script into a useful inbox | S | Good quick win |
| 4 | AdGuard DNS health panel | Surfaces network-wide DNS degradation and protection state | M | Build if AdGuard is checked often |
| 5 | Alert maintenance windows | Prevents expected work from creating noisy incidents | S–M | Build after alert aggregation/digests |
| 6 | TLS certificate expiry watch | Prevents avoidable certificate outages | S | Only if Kuma does not already cover it |

---

## 1. Mission Control Disaster-Recovery Center

**Why it helps:** Mission Control now stores schedules, task definitions, history,
configuration, endpoint credentials, energy history, and operational state in one SQLite
database. Proxmox backup assurance protects guests, but it does not prove that Mission
Control's own database can be restored.

### MVP

- Show the newest database backup, age, size, integrity result, and retention status.
- Create a consistent SQLite snapshot on a schedule and retain a bounded number of copies.
- Validate each copy with `PRAGMA quick_check` (or `integrity_check`) and
  `PRAGMA foreign_key_check`.
- Add a manual **restore drill verified** date and reminder.
- Store backups outside the Git checkout and outside `prisma/`, so deploys cannot replace
  them.
- Document a CLI-only restore procedure; do not restore the live database from the web UI.

### Acceptance checks

- A copied WAL file is never mistaken for a complete backup.
- A failed or stale backup creates an alert with the exact reason.
- Retention cleanup cannot delete the newest known-good copy.
- The verification result belongs to the backup file, not the live database.
- No backup or restore artifact can be downloaded through an unauthenticated route.

### Implementation note

SQLite documents two appropriate snapshot mechanisms: the Online Backup API and
`VACUUM INTO`. `VACUUM INTO` creates a compact copy, while the Online Backup API can copy
incrementally. The implementation should use whichever mechanism is reliably supported by
the project's libsql adapter/runtime, then verify the resulting file independently.

**Primary sources:**

- [SQLite Online Backup API](https://sqlite.org/backup.html)
- [SQLite VACUUM / VACUUM INTO](https://www.sqlite.org/lang_vacuum.html)
- [SQLite PRAGMA integrity_check and foreign_key_check](https://www.sqlite.org/pragma.html)

---

## 2. Deployment and Change Ledger

**Why it helps:** `deploy/deploy.sh` pulls, installs, builds, migrates, and restarts several
services, but Mission Control has no durable answer to:

- what commit is running;
- when a deploy started and finished;
- whether build, migration, or restart failed;
- whether an alert began immediately after a deployment.

### MVP

- Record commit SHA, short subject, deploy start/end time, outcome, and failed stage.
- Show the current deployed SHA and the previous five deployments.
- Link each SHA to GitHub.
- Overlay deploy markers on the existing history/log incident timeline, or at minimum show
  “deployed 12 minutes before this error.”
- Keep records even when the build fails before Mission Control restarts. A small append-only
  JSONL journal owned by the deploy script is safer for this than depending solely on the web
  process being available.

### Acceptance checks

- A failed build or migration appears even if the app never restarts.
- Secrets and environment values are never captured.
- Re-running the same SHA is represented as a new attempt, not silently deduplicated.
- A partial service restart identifies which service failed.

### Later extension

If N8N already receives GitHub push payloads, it can pass the commit metadata into the deploy
record. Do not add a second public webhook unless it is authenticated and signature-verified.

**Primary sources:**

- [GitHub webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [About GitHub webhooks](https://docs.github.com/en/webhooks/about-webhooks)

**Local source:** `deploy/deploy.sh`

---

## 3. Release Radar

**Why it helps:** `scripts/util/github-release.ts` already checks seven relevant repositories,
but its JSON output is ephemeral. A small inbox would turn that sunk work into a recurring
operator benefit without giving Mission Control deployment authority.

### MVP

- Extract the repository list and fetcher into a shared canonical module.
- Persist the latest seen release per repository and an acknowledged/ignored state.
- Show newly published versions, publication time, and links to release notes.
- Add a small badge for unacknowledged releases.
- Poll daily through the existing worker-timer system.
- Keep the feature read-only: link to Komodo or GitHub; do not pull or deploy images.

### Acceptance checks

- A poll does not repeatedly recreate the same release.
- One unavailable repository does not hide results from the others.
- GitHub rate-limit responses are visible but do not create false “no updates” results.
- The current script and UI derive from one repository registry.

### Why this ranks above Komodo-only updates

The existing list includes n8n, Homebridge, Nginx Proxy Manager, and other software that may
not all be represented as updateable Komodo resources. Release Radar is an awareness inbox;
Komodo remains responsible for actual container updates.

**Primary source:** [GitHub REST API endpoints for releases](https://docs.github.com/en/rest/releases/releases)

**Local source:** `scripts/util/github-release.ts`

---

## 4. AdGuard DNS Health Panel

**Why it helps:** DNS is a shared dependency: when it is degraded, many unrelated services
look broken. A compact panel can distinguish “the app is down” from “name resolution is the
common failure,” while also showing whether filtering was accidentally disabled.

### MVP

- Configure one AdGuard Home endpoint and server-side credential.
- Show service/protection status, query volume, blocked percentage, average processing time,
  and top clients.
- Alert when protection is disabled, the endpoint is unreachable, or latency is above a
  simple threshold.
- Retain only small hourly aggregates if history proves useful; do not store raw DNS query
  logs.

### Acceptance checks

- Credentials remain server-side and masked.
- AdGuard being unreachable is distinct from protection being disabled.
- No filtering, rewrite, client, or upstream-DNS mutation exists in the MVP.
- Client names/addresses are not sent to external analytics or notifications by default.

**Primary source:** AdGuard Home's maintained OpenAPI specification exposes status and
statistics surfaces, including aggregate query/blocking data and top clients/domains:
[AdGuard Home OpenAPI](https://github.com/AdguardTeam/AdGuardHome/blob/master/openapi/openapi.yaml)

---

## 5. Alert Maintenance Windows

**Why it helps:** Planned deploys, storage maintenance, and host reboots can create expected
Proxmox, log, automation, and future Telegram alerts. Without suppression, operators learn to
ignore alerts.

### MVP

- Create a maintenance window with start, end, reason, and affected alert sources.
- During the window, continue collecting raw events but mark matching alerts as suppressed.
- Show suppressed counts and automatically resume normal alerting at expiry.
- Include the maintenance reason in incident views.

### Acceptance checks

- Suppression never deletes logs or health evidence.
- Expired windows cannot continue muting alerts.
- High-severity sources can be declared non-suppressible.
- The UI clearly distinguishes healthy from suppressed/unknown.

### Build order

Build this after the existing **Automation Watchdog** and preferably after a unified incident
or Telegram digest exists. Before that, there is too little centralized alert routing for a
maintenance-window abstraction to pay for itself.

---

## 6. TLS Certificate Expiry Watch

**Why it helps:** Certificate expiry is predictable and cheap to detect. It can prevent an
avoidable outage for public or internal HTTPS services.

### MVP

- Configure a small list of important HTTPS host/port pairs.
- Read the peer certificate and show issuer, subject, and days remaining.
- Alert at 30, 14, and 7 days, with a separate state for handshake or hostname-validation
  failure.
- Never disable certificate verification merely to obtain an apparently healthy result.

### Acceptance checks

- A connection failure is not reported as certificate expiry.
- SNI is sent for named virtual hosts.
- Expired, hostname-invalid, self-signed, and unreachable states remain distinguishable.

### Conditional recommendation

Uptime Kuma commonly owns endpoint and certificate monitoring in this environment. Build this
only if Kuma is not already configured to alert on these certificates or if its alert state
cannot be consumed. Avoid maintaining two independent certificate inventories.

**Primary source:** Node's TLS API exposes peer certificate metadata, including validity
fields, through `tls.TLSSocket.getPeerCertificate()`:
[Node.js TLS documentation](https://nodejs.org/api/tls.html)

---

## Recommended Sequence

Do **not** displace the existing backlog's first normal pick, **Automation Watchdog**. The best
sequence is:

1. Automation Watchdog (existing backlog)
2. Mission Control Disaster-Recovery Center
3. Deployment and Change Ledger
4. Release Radar
5. Telegram Incident Digest (existing backlog)
6. Maintenance Windows, once notification noise is real

AdGuard and TLS monitoring are conditional integrations: add them only when they replace a
manual check or fill a confirmed Uptime Kuma gap.

## Ideas Rejected in This Round

| Idea | Reason |
|---|---|
| Generic service-status dashboard | Duplicates Uptime Kuma and current Proxmox/Pulse pages. |
| Docker update/deploy controls | Komodo owns declared state and deployments. |
| Full DNS query-log browser | AdGuard already provides it; copying raw DNS history adds privacy and storage cost. |
| Automatic restore testing from the web UI | Too destructive for an MVP; track manual restore drills instead. |
| GitHub push webhook exposed directly by Mission Control | N8N already owns the push-to-deploy path; extend that path before adding another ingress. |
| AI incident root-cause autopilot | First collect trustworthy automation health, backup state, and deploy evidence. |
