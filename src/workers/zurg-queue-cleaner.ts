#!/usr/bin/env bun
/** Move completed Zurg content into the special media path, then forget its queue job. */

import { access, mkdir, rename } from "fs/promises";
import { basename, join } from "path";
import { ZurgClient, type ZurgTorrent } from "@/lib/clients/zurg";
import { resolveConfig } from "@/lib/config";
import { parseArgs } from "../../scripts/_lib/cli";
import { banner, info, warn } from "../../scripts/_lib/log";

const DEFAULT_INTERVAL_S = 5;
const COMPLETED_STATE = "pausedUP";

export async function pollOnce(client: Pick<ZurgClient, "listTorrents" | "removeTorrent">, specialMediaPath: string): Promise<void> {
  let torrents: ZurgTorrent[];
  try {
    torrents = await client.listTorrents();
  } catch (error) {
    warn(`Error fetching Zurg torrents: ${(error as Error).message}`);
    return;
  }

  for (const torrent of torrents) {
    if (torrent.state !== COMPLETED_STATE || !torrent.content_path) continue;
    const release = basename(torrent.content_path);
    if (!release || release === "." || release === "/") continue;
    const destination = join(specialMediaPath, release);
    try {
      await access(destination);
    } catch {
      try {
        await mkdir(specialMediaPath, { recursive: true });
        await rename(torrent.content_path, destination);
        info(`Moved completed Zurg content: ${torrent.content_path} -> ${destination}`);
      } catch (error) {
        warn(`Failed to move Zurg content ${torrent.content_path}: ${(error as Error).message}`);
        continue;
      }
    }
    try {
      await client.removeTorrent(torrent.hash);
      info(`Removed completed Zurg job: ${torrent.hash}`);
    } catch (error) {
      warn(`Failed to remove Zurg job ${torrent.hash}: ${(error as Error).message}`);
    }
  }
}

export async function main(): Promise<void> {
  const args = parseArgs({
    once: { type: "boolean", default: false },
    interval: { type: "number", default: DEFAULT_INTERVAL_S },
    category: { type: "string", default: process.env.ZURG_CATEGORY || "special" },
  });
  banner("zurg-queue-cleaner");

  let announced = false;
  const pollConfiguredOnce = async () => {
    const cfg = await resolveConfig();
    if (!announced) {
      info(`Zurg: ${cfg.zurgUrl}`);
      info(`Special destination: ${cfg.specialMediaPath}`);
      announced = true;
    }
    const client = new ZurgClient(cfg.zurgUrl, cfg.zurgApiKey, args.category);
    await pollOnce(client, cfg.specialMediaPath);
  };

  if (args.once) return pollConfiguredOnce();
  for (;;) {
    await pollConfiguredOnce();
    await Bun.sleep(args.interval * 1000);
  }
}

if (import.meta.main) main().catch((error) => { warn(`zurg queue cleaner failed: ${(error as Error).message}`); process.exit(1); });
