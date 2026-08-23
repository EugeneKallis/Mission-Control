#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Deploy script — called by N8N webhook on push.
#
# What it does:
#   1. Pulls latest code from git (repo cloned in $REPO_DIR)
#   2. Installs deps and builds
#   3. Copies built code to /opt/mission-control
#   4. Restarts the service
#
# N8N workflow: on push → "Execute Command" → run this script
#
# Usage:
#   sudo ./deploy/deploy.sh
#
# Env overrides:
#   REPO_DIR   — path to repo clone  (default: /opt/mission-control)
#   DEPLOY_DIR — production location (default: /opt/mission-control)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mission-control}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/mission-control}"
DEPLOY_LOG_PATH="${DEPLOY_LOG_PATH:-/var/lib/mission-control/deployments.jsonl}"
DEPLOY_STAGE="starting"
DEPLOY_STARTED_AT="$(date +%s)"
DEPLOY_SHA="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)"
DEPLOY_SUBJECT="$(git -C "$REPO_DIR" log -1 --format=%s 2>/dev/null || true)"
DEPLOY_REPO_URL="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"

record_deploy() {
  mkdir -p "$(dirname "$DEPLOY_LOG_PATH")"
  DEPLOY_EVENT_STATUS="$1" DEPLOY_EVENT_STAGE="$DEPLOY_STAGE" DEPLOY_EVENT_SHA="$DEPLOY_SHA" \
    DEPLOY_EVENT_SUBJECT="$DEPLOY_SUBJECT" DEPLOY_EVENT_REPO_URL="$DEPLOY_REPO_URL" \
    DEPLOY_EVENT_STARTED="$DEPLOY_STARTED_AT" DEPLOY_LOG_PATH="$DEPLOY_LOG_PATH" bun -e '
      const fs = require("fs");
      const started = Number(process.env.DEPLOY_EVENT_STARTED);
      const remote = (process.env.DEPLOY_EVENT_REPO_URL || "").replace(/^git@github.com:/, "https://github.com/").replace(/\.git$/, "");
      fs.appendFileSync(process.env.DEPLOY_LOG_PATH, JSON.stringify({
        timestamp: new Date().toISOString(),
        status: process.env.DEPLOY_EVENT_STATUS,
        sha: process.env.DEPLOY_EVENT_SHA || "",
        subject: process.env.DEPLOY_EVENT_SUBJECT || "",
        url: remote ? remote + "/commit/" + (process.env.DEPLOY_EVENT_SHA || "") : "",
        stage: process.env.DEPLOY_EVENT_STAGE || "unknown",
        durationSeconds: Math.max(0, Math.round(Date.now() / 1000 - started)),
      }) + "\n", { mode: 0o600 });
    ' 2>/dev/null || true
}

finish_deploy() {
  status="$1"
  trap - EXIT
  if [ "$status" -eq 0 ]; then record_deploy success; else record_deploy failed; fi
  exit "$status"
}

record_deploy started
trap 'finish_deploy $?' EXIT

echo "=== Deploying Mission Control ==="
echo "  Source: $REPO_DIR"
echo "  Target: $DEPLOY_DIR"

# 1. Pull latest
DEPLOY_STAGE="pull"
echo "→ Pulling latest code..."
cd "$REPO_DIR"
git checkout main
git pull origin main
DEPLOY_SHA="$(git rev-parse HEAD)"
DEPLOY_SUBJECT="$(git log -1 --format=%s)"

# 2. Install dependencies and build
DEPLOY_STAGE="install"
echo "→ Installing dependencies..."
bun install

DEPLOY_STAGE="build"
echo "→ Building..."
bun next build

# 3. Copy to deploy location (same dir if already in place)
#    If REPO_DIR == DEPLOY_DIR, this is a no-op but helps with clean deployments
if [ "$REPO_DIR" != "$DEPLOY_DIR" ]; then
  DEPLOY_STAGE="copy"
  echo "→ Copying to $DEPLOY_DIR..."
  rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.next' \
    "$REPO_DIR/" "$DEPLOY_DIR/"
fi

# 4. Install production deps at deploy location
DEPLOY_STAGE="production-install"
echo "→ Installing production dependencies..."
cd "$DEPLOY_DIR"
bun install --production

# 4a. Ensure Playwright browser is available for the energy-price scraper.
#     Idempotent — skips if already installed.
DEPLOY_STAGE="playwright"
echo "→ Ensuring Playwright browser..."
npx playwright install chromium 2>/dev/null || echo "  (Playwright chromium install skipped)"

# 4b. Apply any new migrations. Idempotent — no-op if already at latest.
#     This avoids the SQLITE_READONLY crash caused by `git pull`
#     overwriting a tracked dev.db while its -wal file is live.
DEPLOY_STAGE="migrate"
echo "→ Applying database migrations..."
cd "$DEPLOY_DIR"
bunx prisma migrate deploy

# 5. Restart services
DEPLOY_STAGE="restart"
echo "→ Restarting services..."
systemctl restart mission-control.service
systemctl restart mission-control-magnet-bridge.service
systemctl restart mission-control-broken-link-checker.service
# Note: scraper and energy-price scrapers are now run in-process via the
# worker timer scheduler (configured in the web UI at /timers).
# The .service units are kept for manual one-off runs.

DEPLOY_STAGE="complete"
echo "=== Deploy complete ==="
