#!/usr/bin/env bun
/**
 * icon-gen — generate PWA / favicon icons from a single source PNG.
 *
 * Auto-crops to a square (centered on the larger dimension) and resizes
 * to 192, 180, 32, 16, and a multi-resolution .ico. Output goes to
 * public/ by default so the existing manifest picks them up.
 *
 * Usage:
 *   just script scripts/util/icon-gen.ts -- ./my-logo.png
 *   just script scripts/util/icon-gen.ts -- ./logo.png --out public
 *
 * Requires the `sharp` package at runtime; if missing the script
 * suggests the install command.
 */

import { parseArgs } from "../_lib/cli";
import { banner, error, info } from "../_lib/log";

async function main() {
  const args = parseArgs({
    out: { type: "string", default: "public" },
  });
  banner("icon-gen");

  const src = args._[0];
  if (!src) {
    error("Usage: icon-gen <source.png> [--out public]");
    process.exit(1);
  }

  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch {
    error("`sharp` is required. Run: bun add -d sharp");
    process.exit(1);
  }

  const image = sharp(src);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    error(`Could not read dimensions from ${src}`);
    process.exit(1);
  }
  const side = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - side) / 2);
  const top = Math.floor((meta.height - side) / 2);
  const cropped = image.extract({ left, top, width: side, height: side });

  const targets: { name: string; size: number }[] = [
    { name: "icon-192.png", size: 192 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "favicon-32x32.png", size: 32 },
    { name: "favicon-16x16.png", size: 16 },
  ];
  for (const t of targets) {
    const out = `${args.out}/${t.name}`;
    await cropped.clone().resize(t.size, t.size).png().toFile(out);
    info(`wrote ${out} (${t.size}×${t.size})`);
  }

  // ICO (multi-resolution) — sharp produces a real ICONDIR container
  // that includes 16, 32, and 48 px frames in one file. The string form
  // "ico" and the `sizes` option are not in sharp's .d.ts (the .d.ts
  // lags behind the runtime), so we cast the format to the union and
  // the options to the loose `Record<string, unknown>` type. Runtime
  // behavior is correct in sharp ≥ 0.32.
  const icoPath = `${args.out}/favicon.ico`;
  const formatArg = "ico" as unknown as Parameters<typeof cropped.toFormat>[0];
  const optionsArg = { sizes: [16, 32, 48] } as unknown as Parameters<typeof cropped.toFormat>[1];
  await cropped
    .clone()
    .resize(48, 48) // master size; sharp combines with the other declared sizes
    .toFormat(formatArg, optionsArg)
    .toFile(icoPath);
  info(`wrote ${icoPath} (multi-frame ICO: 16, 32, 48)`);
}

if (import.meta.main) {
  main().catch((err) => {
    error("icon-gen failed", err);
    process.exit(1);
  });
}
