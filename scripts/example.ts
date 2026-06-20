#!/usr/bin/env npx tsx
/**
 * Example one-off script
 *
 * Usage: just script scripts/example.ts
 */

async function main() {
  const args = process.argv.slice(2);
  console.log("Hello from an one-off script!");
  console.log("Args:", args);
  console.log("Environment:", process.env.NODE_ENV ?? "not set");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
