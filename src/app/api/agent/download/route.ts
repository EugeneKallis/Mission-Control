/**
 * GET /api/agent/download?arch=amd64|arm64|arm
 *
 * Serves the agent binary. The original ServerTool ships a pre-compiled
 * Go binary under `bin/agent-linux-<arch>`. Mission Control does not
 * bundle a pre-built binary in this repo; instead we expose a TypeScript
 * `src/workers/agent.ts` that the install script can use via
 *   /api/agent/download?arch=ts
 *
 * For now we serve a small shell wrapper that uses `bun` to run the
 * bundled agent source. This keeps the project self-contained without
 * requiring a build step for the agent binary.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET(request: NextRequest) {
  const arch = request.nextUrl.searchParams.get("arch") ?? "ts";

  if (arch === "ts") {
    // Serve a shell wrapper that pulls the agent source from the repo
    // and runs it with bun. Used by the install script.
    const wrapper = `#!/bin/bash
# Mission Control Agent (TypeScript / Bun)
# This wrapper installs a small systemd-managed process that pulls
# the agent source from the server and runs it with bun.
set -e

SERVER_URL="\${SERVER_URL:-$(cat /etc/mission-control-agent.conf 2>/dev/null || echo "")}"
if [ -z "$SERVER_URL" ]; then
  echo "ERROR: SERVER_URL not set. Reinstall with: curl -sL <server>/api/agent/install | bash"
  exit 1
fi

# Pull the agent source once, then exec it. The agent will re-pull on
# version mismatch if a newer version is reported in the next heartbeat.
mkdir -p /opt/mission-control-agent
curl -fsSL "$SERVER_URL/api/agent/source" -o /opt/mission-control-agent/agent.ts
exec bun /opt/mission-control-agent/agent.ts -server "$SERVER_URL"
`;
    return new NextResponse(wrapper, {
      headers: {
        "Content-Type": "text/x-shellscript; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mission-control-agent"',
      },
    });
  }

  // For amd64/arm64/arm, the user is expected to ship a pre-built Go
  // binary at bin/agent-linux-<arch>. We do not bundle it in this repo.
  try {
    const path = join(process.cwd(), "bin", `agent-linux-${arch}`);
    const bytes = readFileSync(path);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="mission-control-agent-linux-${arch}"`,
      },
    });
  } catch {
    return new NextResponse(
      `No prebuilt binary for arch=${arch}. Use arch=ts to install the TypeScript agent via bun.\n`,
      { status: 404, headers: { "Content-Type": "text/plain" } }
    );
  }
}
