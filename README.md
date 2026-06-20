# Mission Control

A server-hosted service built with Next.js (React frontend + TypeScript API routes backend).  
Runs on **Bun** — one long-running process serves both frontend and API.

## Quick Start (Local Dev)

```bash
# Prerequisites: Bun + just
#   curl -fsSL https://bun.sh/install | bash
#   brew install just

git clone <repo-url> && cd mission-control

just init      # install deps + typecheck
just dev       # start dev server at http://localhost:3000
```

## Service Installation (Server)

The project runs as a **systemd service** at `/opt/mission-control`.

### 1. Clone the repo

```bash
sudo git clone <repo-url> /opt/mission-control
sudo chown -R $USER:$USER /opt/mission-control
cd /opt/mission-control
```

### 2. Install the service (one-time)

```bash
sudo just install-service
```

This runs `deploy/install.sh`, which:
- Installs Bun if not present
- Builds the app
- Copies systemd unit files to `/etc/systemd/system/`
- Enables and starts:
  - `mission-control.service` — the Next.js app (frontend + API), always running
  - `mission-control-scraper.timer` — triggers the scraper task every 30 minutes
  - `mission-control-scraper.service` — the scraper task itself (runs once per timer tick)

### 3. Verify

```bash
just status     # check service status
just logs       # tail logs
```

### Management

```bash
just start      # start the service
just stop       # stop the service
just restart    # restart the service
just logs       # tail service logs
```

## Deploy on Push (N8N)

An N8N workflow watches for pushes and auto-deploys:

1. Push to `main`
2. N8N runs: `ssh user@server "cd /opt/mission-control && sudo just deploy"`
3. The `deploy` recipe pulls latest → installs deps → builds → restarts the service

## One-off Scripts & Cron Tasks

| Command | Description |
|---|---|
| `just script scripts/foo.ts` | Run a one-off TypeScript script |
| `just run-worker` | Run scraper task once (default) |
| `just run-worker src/workers/other.ts` | Run a different worker task |

Workers are standalone TypeScript files that **run once and exit**.  
Production timing is handled by **systemd timers**, crontab, or N8N — not by the scripts themselves.

## Structure

```
├── src/
│   ├── app/              # Next.js App Router (pages + API routes)
│   │   ├── page.tsx      # Frontend pages
│   │   └── api/          # Backend API routes
│   ├── lib/              # Shared utilities, db clients, config
│   └── workers/          # Cron tasks / background processes
├── scripts/              # One-off TypeScript scripts
├── deploy/               # systemd units + install/deploy scripts
├── justfile              # All project commands
└── AGENTS.md             # Living scope & conventions doc
```

## Commands

| Command | Description |
|---|---|
| `just setup` | Install dependencies |
| `just init` | Full setup + typecheck |
| `just dev` | Start Next.js dev server |
| `just build` | Production build |
| `just start` | Start service |
| `just script name` | Run a one-off script |
| `just lint` | Lint code |
| `just typecheck` | Type-check app + scripts |
| `just run-worker path` | Run a cron task once (default: scraper) |
| `just install-service` | One-time: install systemd service on server |
| `just deploy` | Full deploy: pull → build → restart (N8N) |
| `just stop` | Stop systemd service |
| `just restart` | Restart systemd service |
| `just logs` | Tail service logs |

> See **AGENTS.md** for the full project scope, conventions, and update instructions.
