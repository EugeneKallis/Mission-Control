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

# ── Production ───────────────────────────────────────────────────────────────

# Start the production server (build first)
start:
    npx next start

# Stop the production server (if running via systemd/PM2)
stop:
    @echo "Use: sudo systemctl stop mission-control"

# Restart the production server
restart:
    @echo "Use: sudo systemctl restart mission-control"

# ── One-off Scripts ──────────────────────────────────────────────────────────

# Run a one-off TypeScript script: just script scripts/foo.ts
# Or: just script-name foo
script name="":
    npx tsx {{name}}

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
