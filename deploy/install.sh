#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Install Mission Control as a systemd service on a fresh server.
# Run once after the repo is cloned/rsynced to /opt/mission-control.
#
# Usage:
#   sudo ./deploy/install.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEPLOY_DIR="/opt/mission-control"
SERVICES_DIR="$DEPLOY_DIR/deploy"

echo "=== Installing Mission Control ==="

# 1. Build the app
echo "→ Building..."
cd "$DEPLOY_DIR"
npm ci
npm run build

# 2. Install systemd units
echo "→ Installing systemd units..."
cp "$SERVICES_DIR/mission-control.service" /etc/systemd/system/
cp "$SERVICES_DIR/mission-control-scraper.service" /etc/systemd/system/
cp "$SERVICES_DIR/mission-control-scraper.timer" /etc/systemd/system/

# 3. Reload systemd and enable services
echo "→ Enabling services..."
systemctl daemon-reload
systemctl enable --now mission-control.service
systemctl enable --now mission-control-scraper.timer

# 4. Show status
echo ""
echo "=== Install complete ==="
systemctl status mission-control.service --no-pager
systemctl status mission-control-scraper.timer --no-pager
echo ""
echo "Logs:  journalctl -u mission-control.service -f"
