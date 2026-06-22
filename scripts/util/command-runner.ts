#!/usr/bin/env bun
/**
 * command-runner — SSH wrapper that runs a single command on the
 * configured remote host, streams the output, and exits with the
 * remote exit code.
 *
 * Mirrors the Go command_runner agent: fixed user/host/identity, all
 * remaining args are passed through to ssh verbatim.
 *
 * Usage:
 *   just script scripts/util/command-runner.ts -- uptime
 *   just script scripts/util/command-runner.ts -- 'sudo systemctl restart nginx'
 *
 * Env (all required unless defaulted):
 *   SSH_HOST (default root@mission-control.local)
 *   SSH_KEY  (default ~/.ssh/id_ed25519)
 *   SSH_PORT (default 22)
 */

import { spawn } from "bun";
import { parseArgs } from "../_lib/cli";
import { error, info } from "../_lib/log";

async function main() {
  const args = parseArgs({
    host: { type: "string", default: process.env.SSH_HOST || "root@mission-control.local" },
    key: { type: "string", default: process.env.SSH_KEY || `${process.env.HOME}/.ssh/id_ed25519` },
    port: { type: "number", default: Number(process.env.SSH_PORT ?? 22) },
  });

  const cmd = args._.join(" ");
  if (!cmd) {
    error("Usage: command-runner -- <command> [args...]");
    process.exit(1);
  }

  info(`ssh ${args.host} (port ${args.port}) :: ${cmd}`);

  const proc = spawn({
    cmd: [
      "ssh",
      "-i", args.key,
      "-p", String(args.port),
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=accept-new",
      args.host,
      cmd,
    ],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const exit = await proc.exited;
  process.exit(exit);
}

if (import.meta.main) {
  main().catch((err) => {
    error("command-runner failed", err);
    process.exit(1);
  });
}
