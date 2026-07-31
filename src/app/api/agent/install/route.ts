/**
 * GET /api/agent/install
 *
 * Serve a shell script that the user can pipe to `bash` to install
 * the agent binary + systemd service on a remote host.
 *
 *   curl -sL http://server:port/api/agent/install | bash
 *
 * The server URL is inferred from the request host. The script downloads
 * the Bun/TypeScript wrapper, installs a systemd unit, and starts the agent
 * pointing back at this server.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!/^https?:$/.test(request.nextUrl.protocol) || !/^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(host)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 400 });
  }
  // Use Host so agents behind a reverse proxy connect to the public server.
  // The strict host allowlist makes interpolation into the generated shell safe.
  const serverURL = `${request.nextUrl.protocol}//${host}`;

  const script = `#!/bin/bash
set -e

echo "Server URL: ${serverURL}"

if ! command -v bun >/dev/null; then
  echo "ERROR: Bun is required. Install it from https://bun.sh, then rerun this command."
  exit 1
fi
BUN_BIN="$(command -v bun)"

if [ "$EUID" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

echo "Stopping existing agent (if any)..."
$SUDO systemctl stop mission-control-agent 2>/dev/null || true
$SUDO systemctl stop servertool-agent 2>/dev/null || true

echo "Downloading agent..."
$SUDO curl -fsSL "${serverURL}/api/agent/download?arch=ts" -o /usr/local/bin/mission-control-agent
$SUDO chmod +x /usr/local/bin/mission-control-agent

cat <<EOF | $SUDO tee /etc/systemd/system/mission-control-agent.service
[Unit]
Description=Mission Control Agent
After=network.target

[Service]
Environment="SERVER_URL=${serverURL}"
Environment="BUN_BIN=$BUN_BIN"
ExecStart=/usr/local/bin/mission-control-agent
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now mission-control-agent

echo "Agent installed and started!"
echo "Check status with: sudo systemctl status mission-control-agent"
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Content-Disposition": 'inline; filename="install.sh"',
    },
  });
}
