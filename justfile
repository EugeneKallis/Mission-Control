# ── Mission Control ──────────────────────────────────────────────────────────
# see https://just.systems/man/en/ for just docs

export NODE_ENV := ""
default := "dev"

# ── Setup ────────────────────────────────────────────────────────────────────

# Install all dependencies
setup:
    npm install

# Initialize the project (install + build typecheck)
init: setup typecheck
    @echo "✔ Project ready."

# ── Development ──────────────────────────────────────────────────────────────

# Start the dev server (default target)
dev:
    npx next dev

# ── Build ────────────────────────────────────────────────────────────────────

# Build for production
build:
    npx next build

# ── Production (systemd) ─────────────────────────────────────────────────────

# Start the production server (build first, foreground — for testing)
start:
    npx next start

# Install as a systemd service on the server (run once)
install-service:
    sudo ./deploy/install.sh

# Full deploy: pull, build, restart (called by N8N on push)
deploy:
    sudo ./deploy/deploy.sh

# Stop the service
stop:
    sudo systemctl stop mission-control

# Restart the service
restart:
    sudo systemctl restart mission-control

# Tail the service logs
logs:
    sudo journalctl -u mission-control.service -f

# ── One-off Scripts ──────────────────────────────────────────────────────────

# Run a one-off TypeScript script:  just script scripts/foo.ts
# List available scripts:           ls scripts/
script name:
    @npx tsx {{name}}

# ── Scraper / Cron Tasks (run once — systemd timer handles scheduling) ────────

# Run the scraper task once (default). Call via systemd timer or crontab.
# Other tasks:  just run-worker src/workers/other.ts
run-worker path="src/workers/scraper-worker.ts":
    npx tsx {{path}}

# ── Quality ──────────────────────────────────────────────────────────────────

# Type-check all code (both app and scripts)
typecheck:
    npx tsc --noEmit --project tsconfig.json
    npx tsc --noEmit --project tsconfig.scripts.json

# Lint
lint:
    next lint

# Format (stub — add prettier or biome when you like)
fmt:
    @echo "No formatter configured yet. Add prettier or biome."

# ── Help ─────────────────────────────────────────────────────────────────────

# List available commands
list:
    just --list
