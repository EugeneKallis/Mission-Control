#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Install Mission Control as a systemd service on a fresh server.
# Run once after the repo is cloned/rsynced to /opt/mission-control.
#
# Usage:
#   ./deploy/install.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEPLOY_DIR="/opt/mission-control"
SERVICES_DIR="$DEPLOY_DIR/deploy"

echo "=== Installing Mission Control ==="

# Detect bun — must be on PATH
if ! command -v bun &>/dev/null; then
  echo "→ Bun not found — installing..."
  curl -fsSL https://bun.sh/install | bash
  # shellcheck disable=SC2016
  export PATH="$HOME/.bun/bin:$PATH"
fi

BUN_PATH="$(command -v bun)"
echo "→ Bun: $BUN_PATH ($(bun --version))"

# Detect the `pi` binary (Agent chat spawns `pi --mode rpc` to load models).
# nvm installs it under ~/.nvm/versions/node/<ver>/bin/pi, so `command -v pi`
# only works if nvm is loaded in this shell — fall back to a glob search.
PI_PATH=""
if command -v pi &>/dev/null; then
  PI_PATH="$(command -v pi)"
else
  for candidate in \
    "$HOME"/.nvm/versions/node/*/bin/pi \
    /opt/homebrew/bin/pi \
    /usr/local/bin/pi \
    /usr/bin/pi \
    "$HOME"/.local/bin/pi; do
    if [ -x "$candidate" ]; then PI_PATH="$candidate"; break; fi
  done
fi
if [ -z "$PI_PATH" ]; then
  echo "✗ pi binary not found. Install with: npm install -g @earendil-works/pi-coding-agent" >&2
  exit 1
fi
PI_DIR="$(dirname "$PI_PATH")"
BUN_DIR="$(dirname "$BUN_PATH")"
SERVICE_PATH="$PI_DIR:$BUN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
echo "→ Pi:  $PI_PATH"
echo "→ Service PATH: $SERVICE_PATH"

# 1. Build the app
echo "→ Building..."
cd "$DEPLOY_DIR"
bun install
bun next build

# 1b. Install Playwright browser for the energy-price scraper
#     (downloads Chromium headless shell ~100 MB).
echo "→ Installing Playwright browser..."
cd "$DEPLOY_DIR"
npx playwright install chromium 2>/dev/null || echo "  (Playwright chromium install skipped — will use system browser if available)"

# 1c. Ensure the database schema is applied.
#     `prisma migrate deploy` is idempotent — no-op if already at latest.
#     This creates dev.db on first install and applies new migrations on
#     subsequent ones, instead of relying on a committed binary blob.
echo "→ Applying database migrations..."
cd "$DEPLOY_DIR"
bunx prisma migrate deploy

# 2. Write service files with the correct bun path
echo "→ Writing systemd units..."
# mission-control.service needs the pi + bun dirs on PATH so the Next.js
# process can spawn `pi --mode rpc`. Other workers only need bun.
sed -e "s|/usr/local/bin/bun|$BUN_PATH|g" \
    -e "s|PATH_PLACEHOLDER|$SERVICE_PATH|g" \
    "$SERVICES_DIR/mission-control.service" > /etc/systemd/system/mission-control.service
sed "s|/usr/local/bin/bun|$BUN_PATH|g" "$SERVICES_DIR/mission-control-magnet-bridge.service" > /etc/systemd/system/mission-control-magnet-bridge.service
sed "s|/usr/local/bin/bun|$BUN_PATH|g" "$SERVICES_DIR/mission-control-broken-link-checker.service" > /etc/systemd/system/mission-control-broken-link-checker.service

# 3. Reload systemd and enable services
# Note: scraper and energy-price scrapers are now run in-process via the
# worker timer scheduler (configured in the web UI at /schedules).
echo "→ Enabling services..."
systemctl daemon-reload
systemctl enable --now mission-control.service
systemctl enable --now mission-control-magnet-bridge.service
systemctl enable --now mission-control-broken-link-checker.service

# 4. Show status
echo ""
echo "=== Install complete ==="
systemctl status mission-control.service --no-pager
systemctl status mission-control-magnet-bridge.service --no-pager
systemctl status mission-control-broken-link-checker.service --no-pager
echo ""
echo "Logs:  journalctl -u mission-control.service -f"
echo "       journalctl -u mission-control-magnet-bridge.service -f"
echo "       journalctl -u mission-control-broken-link-checker.service -f"
echo ""
echo "Worker Timers: http://your-server:3000/schedules"
