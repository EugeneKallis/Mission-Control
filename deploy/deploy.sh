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

echo "=== Deploying Mission Control ==="
echo "  Source: $REPO_DIR"
echo "  Target: $DEPLOY_DIR"

# 1. Pull latest
echo "→ Pulling latest code..."
cd "$REPO_DIR"
git checkout main
git pull origin main

# 2. Install dependencies and build
echo "→ Installing dependencies..."
bun install

echo "→ Building..."
bun next build

# 3. Copy to deploy location (same dir if already in place)
#    If REPO_DIR == DEPLOY_DIR, this is a no-op but helps with clean deployments
if [ "$REPO_DIR" != "$DEPLOY_DIR" ]; then
  echo "→ Copying to $DEPLOY_DIR..."
  rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.next' \
    "$REPO_DIR/" "$DEPLOY_DIR/"
fi

# 4. Install production deps at deploy location
echo "→ Installing production dependencies..."
cd "$DEPLOY_DIR"
bun install --production

# 5. Restart service
echo "→ Restarting service..."
systemctl restart mission-control.service

echo "=== Deploy complete ==="
