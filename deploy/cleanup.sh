#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Cleanup script — removes old systemd services that are no longer needed.
#
# This removes scraper timer units replaced by the in-process scheduler and the
# retired magnet bridge service replaced by the Zurg queue cleaner.
#
# Usage:
#   ./deploy/cleanup.sh          # dry run (show what would be removed)
#   ./deploy/cleanup.sh --apply  # actually remove the services
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DRY_RUN=true
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=false
fi

echo "=== Mission Control Cleanup ==="
if $DRY_RUN; then
  echo "(DRY RUN — no changes will be made. Use --apply to execute.)"
  echo ""
fi

# Services retired by the worker scheduler or Zurg queue cleaner
OLD_SERVICES=(
  "mission-control-scraper.service"
  "mission-control-scraper.timer"
  "mission-control-energy-price-scraper.service"
  "mission-control-energy-price-scraper.timer"
  "mission-control-magnet-bridge.service"
)

echo "The following services will be removed:"
for svc in "${OLD_SERVICES[@]}"; do
  if systemctl list-unit-files "$svc" &>/dev/null 2>&1; then
    echo "  - $svc (installed)"
  else
    echo "  - $svc (not found, skipping)"
  fi
done

echo ""

if $DRY_RUN; then
  echo "Run with --apply to actually remove these services."
  exit 0
fi

echo "→ Removing old services..."

for svc in "${OLD_SERVICES[@]}"; do
  if systemctl list-unit-files "$svc" &>/dev/null 2>&1; then
    echo "  Stopping and disabling $svc..."
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
    rm -f "/etc/systemd/system/$svc"
    echo "  Removed $svc"
  fi
done

echo "→ Reloading systemd daemon..."
systemctl daemon-reload

echo ""
echo "=== Cleanup complete ==="
echo ""
echo "The scraper and energy-price scraper are now scheduled via"
echo "the worker timer scheduler in the web UI at /schedules."
