# Mission Control — Agent Guide

## Project Overview

A server-hosted service built with Next.js (React frontend + TypeScript API routes backend).  
Supports one-off TypeScript scripts for admin tasks and automation.

## Stack

| Layer        | Technology                                 |
| ------------ | ------------------------------------------ |
| Framework    | Next.js (App Router)                       |
| Frontend     | React                                      |
| Backend      | Next.js API Routes (TypeScript)            |
| Language     | TypeScript (app + scripts)                 |
| Runtime      | **Bun** (runs TS natively, no tsx needed)  |
| Task Runner  | Just (justfile)                            |

## Structure

```
├── src/
│   ├── app/              # Next.js App Router (pages + API routes)
│   │   ├── page.tsx      # Frontend pages
│   │   └── api/          # Backend API routes
│   ├── lib/              # Shared utilities, db clients, config
│   └── workers/          # Long-running background processes
├── scripts/              # One-off TypeScript scripts (run via `just script`)
├── public/               # Static assets
├── justfile              # Project commands
└── AGENTS.md             # ← You are here
```

## Commands

Run via `just <command>`:

| Command        | Description                              |
| -------------- | ---------------------------------------- |
| `just setup`   | Install dependencies                     |
| `just init`    | Full setup + typecheck                   |
| `just dev`     | Start Next.js dev server                 |
| `just build`   | Production build                         |
| `just start`   | Start production server                  |
| `just script`  | Run a one-off script                     |
| `just lint`      | Lint code                                |
| `just typecheck`      | Type-check app + scripts                        |
| `just run-worker path` | Run a cron task once (default: scraper)       |
| `just install-service` | One-time: install systemd service on server   |
| `just deploy`          | Full deploy: pull → build → restart (N8N)     |
| `just stop`            | Stop systemd service                           |
| `just restart`         | Restart systemd service                        |
| `just logs`            | Tail service logs                              |

## Deployment

The project runs as a **systemd service** at `/opt/mission-control`.

### Initial install (fresh server)
```bash
# Clone the repo once
git clone <repo-url> /opt/mission-control

# Run the installer
cd /opt/mission-control && just install-service
```

This sets up:
- `mission-control.service` — the Next.js app (React frontend + API routes)
- `mission-control-scraper.timer` — runs the scraper task every 30 minutes
- `mission-control-scraper.service` — the scraper task (called by the timer)

### Deploy on push (N8N workflow)

1. N8N detects a push to the repo
2. Runs: `ssh root@server "cd /opt/mission-control && just deploy"`
3. The deploy script: pulls latest → builds → restarts the service

### deploy/ directory

The `deploy/` directory contains the production system:
- `install.sh` — one-time setup: copies service files, enables + starts systemd units
- `deploy.sh` — pull → build → copy to `/opt/mission-control` → restart (called by N8N)
- `mission-control.service` — systemd unit for the Next.js app (frontend + API routes)
- `mission-control-scraper.service` — systemd unit for the scraper task (runs once and exits)
- `mission-control-scraper.timer` — triggers the scraper every 30 minutes

## Cron Tasks (External Scheduling)

Tasks live in `src/workers/` and are standalone TypeScript files that **run once and exit**.
They can import from `@/lib/` to share code with the rest of the app.

```bash
just run-worker                          # run scraper task
just run-worker src/workers/other.ts     # run a different task
```

**Production timing is handled externally** — systemd timer, crontab, or similar.
The script just does one job and exits; the scheduler calls it on the desired interval.

## Key Conventions

- **API routes** live under `src/app/api/<route>/route.ts`
- **Shared logic** (DB, auth, helpers) goes in `src/lib/`
- **One-off scripts** go in `scripts/` and use the separate `tsconfig.scripts.json`
- **Everything is TypeScript** — strict mode enabled
- **Justfile** is the single source of truth for project commands

## Future Plans

- **pi.dev SDK integration** — SDK will be added to `src/lib/pi/` when available; the project is structured to import it cleanly from there

## Important!

This file is the living scope and convention document.  
**When you add a new capability, update this file** — new directories, new commands, new patterns, new scripts.  
Keeping AGENTS.md current ensures agents and collaborators stay aligned with the project shape.
