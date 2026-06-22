#!/usr/bin/env bun
/**
 * github-release — poll GitHub for the latest releases of tracked repos
 * within a time window. Outputs JSON to stdout.
 *
 * Usage:
 *   just script scripts/util/github-release.ts -- 24
 *     # polls last 24 hours (default)
 *   just script scripts/util/github-release.ts -- 72
 *     # polls last 72 hours
 */

import { parseArgs } from "../_lib/cli";
import { banner, info, warn } from "../_lib/log";

const REPOS = [
  "homebridge/homebridge",
  "moghtech/komodo",
  "n8n-io/n8n",
  "timothymiller/cloudflare-ddns",
  "NginxProxyManager/nginx-proxy-manager",
  "gethomepage/homepage",
  "dmunozv04/iSponsorBlockTV",
];

interface GitHubRelease {
  repo: string;
  url: string;
  tag: string;
  date: string;
}

async function fetchLatestRelease(repo: string): Promise<GitHubRelease | null> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; published_at?: string };
    return {
      repo,
      url: `https://github.com/${repo}`,
      tag: data.tag_name ?? "",
      date: data.published_at ?? "",
    };
  } catch {
    return null;
  }
}

export async function main(argv?: string[]): Promise<void> {
  const args = parseArgs({ hours: { type: "number", default: 24 } }, argv);
  banner("github-release");

  const cutoffMs = Date.now() - args.hours * 3600 * 1000;
  const results: GitHubRelease[] = [];

  for (const repo of REPOS) {
    const result = await fetchLatestRelease(repo);
    if (!result) continue;
    if (result.date) {
      const published = new Date(result.date).getTime();
      if (published < cutoffMs) continue;
    }
    results.push(result);
  }

  info(`Found ${results.length} release(s) in the last ${args.hours} hours`);
  for (const r of results) {
    info(`  ${r.repo} → ${r.tag} (${r.date})`);
  }

  if (results.length === 0) {
    warn("No recent releases found.");
  }

  console.log(JSON.stringify(results, null, 2));
}

if (import.meta.main) {
  main().catch((err) => {
    warn(`github-release failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
