#!/usr/bin/env bun
/**
 * Trakt exporter — runs the Trakt device-code flow, fetches the user's
 * watched shows, and writes the result to a file.
 *
 * Usage:
 *   just script scripts/plex/trakt-exporter.ts
 *     # exports as txt (default)
 *   just script scripts/plex/trakt-exporter.ts -- --csv
 *   just script scripts/plex/trakt-exporter.ts -- --json --year 2023
 *
 * Env:
 *   TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET (required)
 */

import { writeFile } from "fs/promises";
import { TraktClient } from "@/lib/clients/trakt";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, warn } from "../_lib/log";

async function main() {
  const args = parseArgs({
    csv: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    year: { type: "number", default: 0 },
    output: { type: "string", default: "" },
  });
  banner("Trakt exporter");

  const clientId = process.env.TRAKT_CLIENT_ID;
  const clientSecret = process.env.TRAKT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    error("Set TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET in the environment");
    process.exit(1);
  }

  const client = new TraktClient(clientId, clientSecret);
  const device = await client.deviceCode();
  info(`Open ${device.verification_url} and enter code: ${device.user_code}`);
  info(`Code expires in ${Math.floor(device.expires_in / 60)} minutes`);

  const accessToken = await pollForToken(client, device.device_code, device.interval, device.expires_in);
  if (!accessToken) {
    error("Trakt authorization failed");
    process.exit(1);
  }

  const shows = await client.getWatchedShows(accessToken);
  const filtered = args.year > 0 ? shows.filter((s) => s.show.year === args.year) : shows;
  info(`Fetched ${shows.length} watched shows, ${filtered.length} match year filter`);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = args.json ? "json" : args.csv ? "csv" : "txt";
  const outPath = args.output || `./trakt-watched-${ts}.${ext}`;

  if (ext === "json") {
    await writeFile(outPath, JSON.stringify(filtered, null, 2), "utf8");
  } else if (ext === "csv") {
    const lines = ["title,year,plays,last_watched_at,trakt_id,tvdb_id"];
    for (const s of filtered) {
      const title = csvEscape(s.show.title);
      const last = s.last_watched_at;
      lines.push(
        [title, s.show.year, s.plays, last, s.show.ids.trakt, s.show.ids.tvdb ?? ""].join(","),
      );
    }
    await writeFile(outPath, lines.join("\n"), "utf8");
  } else {
    const lines = filtered.map((s) => `${s.show.title} (${s.show.year}) — ${s.plays} play(s)`);
    await writeFile(outPath, lines.join("\n"), "utf8");
  }
  info(`Wrote ${outPath}`);
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function pollForToken(
  client: TraktClient,
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number,
): Promise<string | null> {
  const deadline = Date.now() + expiresInSec * 1000;
  while (Date.now() < deadline) {
    await sleep(intervalSec * 1000);
    try {
      const token = await client.pollDeviceToken(deviceCode);
      return token.access_token;
    } catch (err) {
      if ((err as Error).message !== "PENDING") {
        warn(`Trakt poll error: ${(err as Error).message}`);
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

if (import.meta.main) {
  main().catch((err) => {
    error("trakt-exporter failed", err);
    process.exit(1);
  });
}
