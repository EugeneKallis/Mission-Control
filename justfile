# ── Mission Control ──────────────────────────────────────────────────────────
# see https://just.systems/man/en/ for just docs
# Using Bun as the runtime and package manager.

export NODE_ENV := ""
default := "dev"

# ── Setup ────────────────────────────────────────────────────────────────────

# Install all dependencies + generate Prisma client + apply migrations
setup:
    bun install
    bunx prisma generate
    bunx prisma migrate deploy

# Initialize the project (install + prisma + typecheck)
init: setup typecheck
    @echo "✔ Project ready."

# ── Development ──────────────────────────────────────────────────────────────

# Start the dev server (default target)
dev:
    NEXT_PRIVATE_LOCAL_DEV=1 bun next dev -p 3001 -H 0.0.0.0

# ── Build ────────────────────────────────────────────────────────────────────

# Build for production
build:
    bun next build

# ── Production (systemd) ─────────────────────────────────────────────────────

# Start the production server (build first, foreground — for testing)
start:
    bun next start

# Install as a systemd service on the server (run once)
install-service:
    ./deploy/install.sh

# Full deploy: pull, build, restart (called by N8N on push)
deploy:
    ./deploy/deploy.sh

# Stop the service
stop:
    systemctl stop mission-control

# Restart the service
restart:
    systemctl restart mission-control

# Tail the service logs
logs:
    journalctl -u mission-control.service -f

# ── Magnet Bridge (long-running Decypharr poller) ────────────────────────────

# Run the magnet bridge worker in the foreground (for local dev / debugging)
magnet-bridge:
    bun run src/workers/magnet-bridge.ts

# Tail magnet bridge logs
magnet-bridge-logs:
    journalctl -u mission-control-magnet-bridge.service -f

# Restart the magnet bridge service (picks up new code after deploy)
magnet-bridge-restart:
    systemctl restart mission-control-magnet-bridge.service

# Stop the magnet bridge service
magnet-bridge-stop:
    systemctl stop mission-control-magnet-bridge.service

# ── One-off Scripts ──────────────────────────────────────────────────────────

# Run a one-off TypeScript script:  just script scripts/foo.ts
# List available scripts:           ls scripts/
script name:
    bun run {{name}}

# ── Scraper / Cron Tasks (run once — systemd timer handles scheduling) ────────

# Run the scraper task once (default). Call via systemd timer or crontab.
# Other tasks:  just run-worker src/workers/other.ts
run-worker path="src/workers/scraper-worker.ts":
    bun run {{path}}

# ── Quality ──────────────────────────────────────────────────────────────────

# Type-check all code (app, scripts, and tests)
typecheck:
    bun tsc --noEmit --project tsconfig.json
    bun tsc --noEmit --project tsconfig.scripts.json
    bun tsc --noEmit --project tsconfig.test.json

# Lint
lint:
    bun next lint

# Run unit tests (bun:test, co-located *.test.ts / *.test.tsx)
test:
    bun test

# Run unit tests in watch mode
test-watch:
    bun test --watch

# Run unit tests with coverage report
test-coverage:
    bun test --coverage

# Type-check test files only
typecheck-tests:
    bun tsc --noEmit --project tsconfig.test.json

# Format (stub — add prettier or biome when you like)
fmt:
    @echo "No formatter configured yet. Add prettier or biome."

# ── Help ─────────────────────────────────────────────────────────────────────

# List available commands
list:
    just --list
