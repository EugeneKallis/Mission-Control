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
sed "s|/usr/local/bin/bun|$BUN_PATH|g" "$SERVICES_DIR/mission-control.service" > /etc/systemd/system/mission-control.service
sed "s|/usr/local/bin/bun|$BUN_PATH|g" "$SERVICES_DIR/mission-control-scraper.service" > /etc/systemd/system/mission-control-scraper.service
sed "s|/usr/local/bin/bun|$BUN_PATH|g" "$SERVICES_DIR/mission-control-magnet-bridge.service" > /etc/systemd/system/mission-control-magnet-bridge.service
sed "s|/usr/local/bin/bun|$BUN_PATH|g" "$SERVICES_DIR/mission-control-broken-link-checker.service" > /etc/systemd/system/mission-control-broken-link-checker.service
sed "s|/usr/local/bin/bun|$BUN_PATH|g" "$SERVICES_DIR/mission-control-energy-price-scraper.service" > /etc/systemd/system/mission-control-energy-price-scraper.service
cp "$SERVICES_DIR/mission-control-scraper.timer" /etc/systemd/system/
cp "$SERVICES_DIR/mission-control-energy-price-scraper.timer" /etc/systemd/system/

# 3. Reload systemd and enable services
echo "→ Enabling services..."
systemctl daemon-reload
systemctl enable --now mission-control.service
systemctl enable --now mission-control-scraper.timer
systemctl enable --now mission-control-magnet-bridge.service
systemctl enable --now mission-control-broken-link-checker.service
systemctl enable --now mission-control-energy-price-scraper.timer

# 4. Show status
echo ""
echo "=== Install complete ==="
systemctl status mission-control.service --no-pager
systemctl status mission-control-scraper.timer --no-pager
systemctl status mission-control-magnet-bridge.service --no-pager
systemctl status mission-control-broken-link-checker.service --no-pager
systemctl status mission-control-energy-price-scraper.timer --no-pager
echo ""
echo "Logs:  journalctl -u mission-control.service -f"
echo "       journalctl -u mission-control-magnet-bridge.service -f"
echo "       journalctl -u mission-control-broken-link-checker.service -f"
echo "       journalctl -u mission-control-energy-price-scraper.service -f"
