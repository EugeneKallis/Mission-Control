import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { join } from "path";

export interface ScriptEntry {
  path: string;       // relative path e.g. "scripts/arr/arr-searcher.ts"
  name: string;       // display name e.g. "arr-searcher"
  category: string;   // e.g. "arr", "plex", "media", "util"
  description: string; // one-line description
}

let cached: ScriptEntry[] | null = null;

function getScripts(): ScriptEntry[] {
  if (cached) return cached;

  const scriptsRoot = join(process.cwd(), "scripts");
  const entries: ScriptEntry[] = [];

  function walk(dir: string, relativeDir: string) {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item);
      const rel = relativeDir ? `${relativeDir}/${item}` : item;
      const st = statSync(full, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isDirectory()) {
        // Skip _lib directory (internal helpers)
        if (item.startsWith("_")) continue;
        walk(full, rel);
      } else if (item.endsWith(".ts") && !item.endsWith(".test.ts") && !item.startsWith("_")) {
        // Read first comment line for a one-line description
        let description = "";
        try {
          const content = readFileFirstLinesSync(full, 10);
          const descMatch = content.match(/^\s*\* (.+)/m);
          if (descMatch) description = descMatch[1].trim();
        } catch {}
        entries.push({
          path: `scripts/${rel}`,
          name: item.replace(/\.ts$/, ""),
          category: relativeDir || "root",
          description,
        });
      }
    }
  }

  walk(scriptsRoot, "");
  cached = entries.sort((a, b) => a.path.localeCompare(b.path));
  return cached;
}

function readFileFirstLinesSync(path: string, n: number): string {
  const buf = Buffer.alloc(4096);
  const fd = require("fs").openSync(path, "r");
  const bytesRead = require("fs").readSync(fd, buf, 0, 4096, 0);
  require("fs").closeSync(fd);
  return buf.toString("utf8", 0, bytesRead);
}

export async function GET() {
  return NextResponse.json(getScripts());
}
