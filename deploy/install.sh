#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Install Mission Control as a systemd service on a fresh server.
# Run once after the repo is cloned/rsynced to /opt/mission-control.
#
# Requires Bun installed at /usr/local/bin/bun
#   curl -fsSL https://bun.sh/install | bash
#
# Usage:
#   sudo ./deploy/install.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEPLOY_DIR="/opt/mission-control"
SERVICES_DIR="$DEPLOY_DIR/deploy"
BUN_PATH="/usr/local/bin/bun"

echo "=== Installing Mission Control ==="

# Ensure bun is installed
if ! command -v "$BUN_PATH" &>/dev/null; then
  echo "→ Bun not found at $BUN_PATH — installing..."
  curl -fsSL https://bun.sh/install | bash
  if [ -f "$HOME/.bun/bin/bun" ]; then
    ln -sf "$HOME/.bun/bin/bun" "$BUN_PATH"
  else
    echo "ERROR: Bun install failed. Install manually: curl -fsSL https://bun.sh/install | bash"
    exit 1
  fi
fi
echo "→ Bun $(bun --version)"

# 1. Build the app
echo "→ Building..."
cd "$DEPLOY_DIR"
bun install
bun next build

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
