/**
 * GET /api/agent/install
 *
 * Serve a shell script that the user can pipe to `bash` to install
 * the agent binary + systemd service on a remote host.
 *
 *   curl -sL http://server:port/api/agent/install | bash
 *
 * The server URL is inferred from the request host. The script detects
 * the architecture, downloads the binary via `/api/agent/download?arch=X`,
 * installs a systemd unit, and starts the agent pointing back at this
 * server.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const scheme = request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const serverURL = `${scheme}://${host}`;

  const script = `#!/bin/bash
set -e

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        BINARY_ARCH="amd64"
        ;;
    aarch64|arm64)
        BINARY_ARCH="arm64"
        ;;
    armv7l)
        BINARY_ARCH="arm"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "Detected architecture: $BINARY_ARCH"
echo "Server URL: ${serverURL}"

if [ "$EUID" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

echo "Stopping existing agent (if any)..."
$SUDO systemctl stop mission-control-agent 2>/dev/null || true
$SUDO systemctl stop servertool-agent 2>/dev/null || true

echo "Downloading agent..."
$SUDO curl -L "${serverURL}/api/agent/download?arch=$BINARY_ARCH" -o /usr/local/bin/mission-control-agent
$SUDO chmod +x /usr/local/bin/mission-control-agent

cat <<EOF | $SUDO tee /etc/systemd/system/mission-control-agent.service
[Unit]
Description=Mission Control Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/mission-control-agent -server ${serverURL}
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
