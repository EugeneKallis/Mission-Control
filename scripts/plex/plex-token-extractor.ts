#!/usr/bin/env bun
/**
 * Plex token extractor — runs the OAuth PIN flow standalone and prints
 * `PLEX_TOKEN=...` to stdout (or writes to ~/.servertool/plex_token).
 *
 * Usage:
 *   just script scripts/plex/plex-token-extractor.ts
 *     # prints PLEX_TOKEN=<token> on success
 *   just script scripts/plex/plex-token-extractor.ts -- --save
 *     # also writes to ~/.servertool/plex_token
 *
 * After authorizing, set PLEX_TOKEN in your .env to skip this in future.
 */

import { mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { PlexClient } from "@/lib/clients/plex";
import { parseArgs } from "../_lib/cli";
import { banner, error, info } from "../_lib/log";

async function main() {
  const args = parseArgs({ save: { type: "boolean", default: false } });
  banner("Plex token extractor");

  const pin = await PlexClient.createPin();
  info(`Open this URL and enter the code:\n  https://app.plex.tv/auth#!?clientID=${pin.clientIdentifier}&code=${pin.code}&context[device][product]=Mission%20Control`);
  info(`Code: ${pin.code}`);
  info("Waiting for authorization…");

  const deadline = Date.now() + pin.expiresIn * 1000;
  let token: string | undefined;
  while (Date.now() < deadline) {
    await sleep(2_000);
    const polled = await PlexClient.pollPin(pin.id);
    if (polled.authToken) {
      token = polled.authToken;
      break;
    }
  }

  if (!token) {
    error("Timed out waiting for Plex authorization");
    process.exit(1);
  }

  console.log(`PLEX_TOKEN=${token}`);

  if (args.save) {
    const dir = join(homedir(), ".servertool");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "plex_token"), token, "utf8");
    info(`Saved to ${join(dir, "plex_token")}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

if (import.meta.main) {
  main().catch((err) => {
    error("plex-token-extractor failed", err);
    process.exit(1);
  });
}
