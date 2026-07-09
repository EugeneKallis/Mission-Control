#!/usr/bin/env bun
/**
 * Energy-price scraper — fetch supplier rates from EnergizeCT.com
 *
 * Uses Playwright to load the Compare Energy Supplier Rates page,
 * extracts every offer (supplier, rate, monthly cost, savings vs
 * standard service, term, RECs), and stores them in the `energy_prices`
 * table. Old rows are marked inactive so the API always returns the
 * latest snapshot.
 *
 * Designed to run once daily via systemd timer (9:00 AM).
 *
 * Usage:
 *   just run-worker src/workers/energy-price-scraper.ts
 *   just energy-prices                             # foreground (local dev)
 *
 * Depends on:
 *   playwright — install via `bun add playwright && npx playwright install chromium`
 *
 * Env:
 *   ENERGY_PRICE_UTILITY   — "ev" (Eversource) or "ui" (United Illuminating), default: ev
 *   ENERGY_PRICE_USAGE     — monthly kWh, default: 750
 *   ENERGY_PRICE_HEADED    — "1" to show browser (debug), default: ""
 */

import { chromium } from "playwright";
import { db } from "@/lib/db";

// ── Config ──────────────────────────────────────────────────────────────────

const UTILITIES: Record<string, { name: string; edc: string }> = {
  ev: { name: "Eversource", edc: "1191" },
  ui: { name: "United Illuminating", edc: "1192" },
};

const CUSTOMER_CLASS = "1201"; // Residential
const DEFAULT_USAGE = 750; // kWh/month

// ── Types ───────────────────────────────────────────────────────────────────

export interface SupplierOffer {
  supplier: string;
  rate: number;         // ¢/kWh
  monthlyCost: number;  // $
  savings: number | null; // $ vs standard (negative = cheaper)
  plan: string;
  billingCycles: number | null;
  recs: number | null;  // %
  phone: string;
}

// ── Scraper ─────────────────────────────────────────────────────────────────

function buildUrl(utility: string, usage: number): string {
  const edc = UTILITIES[utility]?.edc ?? UTILITIES.ev.edc;
  return `https://www.energizect.com/rate-board/compare-energy-supplier-rates?customerClass=${CUSTOMER_CLASS}&monthlyUsage=${usage}&planTypeEdc=${edc}`;
}

/**
 * Parse supplier offers from the raw page text.
 *
 * The EnergizeCT page renders each supplier as a card with fields
 * that often span multiple lines (e.g. "Monthly Cost\n\n$86.77").
 * We split by supplier-name boundaries and parse each block as a
 * whole using multi-line regexes.
 */
export function parseSupplierOffers(text: string): SupplierOffer[] {
  const offers: SupplierOffer[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // ── 1. Split into blocks per supplier ──────────────────────────
  // Each supplier offer starts with a name line. Collect all lines
  // until the next name line.
  const blocks: { supplier: string; block: string[] }[] = [];
  let currentSupplier: string | null = null;
  let currentBlock: string[] = [];

  function isSupplierName(line: string): boolean {
    // A supplier name is a short line starting with uppercase, not
    // matching any known page element.
    if (line.length < 3 || line.length > 80) return false;
    if (!/^[A-Z]/.test(line)) return false;
    const skip = new Set([
      "Offer", "Monthly", "Plan", "Phone", "View", "Compare",
      "Enroll", "New", "Consumers", "Fixed", "Energy", "Supply",
      "Print", "Sort", "Showing", "Narrow", "Rebates", "Financing",
      "Rate", "Home", "Resources", "Select", "About", "Explore",
      "Disclaimer", "By", "You", "Eversource",
    ]);
    const firstWord = line.split(/[\s.]+/)[0];
    if (skip.has(firstWord)) return false;
    if (firstWord.startsWith("http")) return false;
    if (line.includes("Standard Service")) return false;
    // Must look like a company name: has uppercase and likely a suffix
    return true;
  }

  // Special case: find "Eversource - Standard Service" blocking first
  // (it's not a supplier card — it's the baseline)
  const standardBlock: string[] = [];
  let foundStandard = false;

  for (const line of lines) {
    // Detect "Eversource - Standard Service" — this is the baseline
    if (line.includes("Standard Service")) {
      foundStandard = true;
      standardBlock.push(line);
      continue;
    }
    if (foundStandard) {
      // Collect all lines until we hit a supplier name boundary
      if (isSupplierName(line) && line !== "Eversource") {
        // This is the start of a real supplier card — finalise standard block
        blocks.push({ supplier: "Eversource - Standard Service", block: [...standardBlock] });
        foundStandard = false;
        currentSupplier = line;
        currentBlock = [line];
      } else {
        standardBlock.push(line);
      }
      continue;
    }

    if (isSupplierName(line)) {
      if (currentSupplier && currentBlock.length > 0) {
        blocks.push({ supplier: currentSupplier, block: [...currentBlock] });
      }
      currentSupplier = line;
      currentBlock = [line];
    } else if (currentSupplier) {
      currentBlock.push(line);
    }
  }
  // Finalise last block
  if (currentSupplier && currentBlock.length > 0) {
    blocks.push({ supplier: currentSupplier, block: [...currentBlock] });
  }

  // ── 2. Parse each block ────────────────────────────────────────
  for (const { supplier, block } of blocks) {
    const joined = block.join("\n");

    // Rate — always on one line: "10.85₵ per kWh"
    const rateMatch = joined.match(/([\d.]+)₵\s*per\s*kWh/);
    if (!rateMatch) continue; // skip blocks without a rate
    const rate = parseFloat(rateMatch[1]);

    // Monthly cost — multi-line: "Monthly Cost\n...\n$81.38"
    const costMatch = joined.match(/\$([\d.]+)\s*at\s*([\d.]+)₵/);
    const monthlyCost = costMatch ? parseFloat(costMatch[1]) : 0;

    // Savings vs standard: "$5.39 / less per month" or "$1.65 / more per month"
    let savings: number | null = null;
    const diffMatch = joined.match(/\$([\d.]+)\s*\/\s*(less|more)\s*per\s*month/);
    if (diffMatch) {
      const amt = parseFloat(diffMatch[1]);
      savings = diffMatch[2] === "less" ? -amt : amt;
    }

    // Billing cycles: "4 Billing Cycles" or "16 Billing Cycles"
    let billingCycles: number | null = null;
    const cyclesMatch = joined.match(/(\d+)\s*Billing\s*Cycles/);
    if (cyclesMatch) {
      billingCycles = parseInt(cyclesMatch[1], 10);
    }

    // RECs: "34.0% RECs"
    let recs: number | null = null;
    const recsMatch = joined.match(/([\d.]+)%\s*RECs/);
    if (recsMatch) {
      recs = parseFloat(recsMatch[1]);
    }

    // Phone — multi-line: "Phone:\n(800) 286-2000"
    let phone = "";
    for (let i = 0; i < block.length; i++) {
      if (block[i].startsWith("Phone:") || block[i] === "Phone") {
        // Look at next line(s) for the number
        for (let j = i + 1; j < Math.min(i + 3, block.length); j++) {
          const maybePhone = block[j];
          if (maybePhone.includes("Enroll") || maybePhone.startsWith("Offer")) break;
          const phoneCandidate = maybePhone.replace(/[^\d()\-\s]/g, "").trim();
          if (phoneCandidate.length > 6 && /[\d]{3}/.test(phoneCandidate)) {
            phone = phoneCandidate;
            break;
          }
        }
        break;
      }
    }

    offers.push({
      supplier,
      rate,
      monthlyCost,
      savings,
      plan: "", // CT residential offers are always "Fixed" — no distinct plan name
      billingCycles,
      recs,
      phone,
    });
  }

  // ── 3. Deduplicate ───────────────────────────────────────────
  const seen = new Set<string>();
  return offers.filter(o => {
    const key = `${o.supplier}|${o.rate}|${o.monthlyCost}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function scrapeEnergizeCT(
  utility: string,
  usage: number,
  headed: boolean,
): Promise<SupplierOffer[]> {
  const url = buildUrl(utility, usage);
  const utilityName = UTILITIES[utility]?.name ?? UTILITIES.ev.name;

  console.log(`[energy-price] Scraping ${utilityName} rates at ${usage} kWh/mo...`);
  console.log(`[energy-price] URL: ${url}`);

  const browser = await chromium.launch({
    headless: !headed,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
    });

    const page = await context.newPage();

    // Bypass Cloudflare Turnstile
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      // @ts-expect-error — Chrome runtime polyfill
      window.chrome = { runtime: {} };
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Give Cloudflare time to resolve the challenge
    await page.waitForTimeout(6000);

    const title = await page.title();
    console.log(`[energy-price] Page title: ${title}`);

    if (title.includes("Just a moment") || title.includes("security")) {
      console.warn("[energy-price] Cloudflare challenge detected, waiting longer...");
      await page.waitForTimeout(12000);
      const retryTitle = await page.title();
      if (retryTitle.includes("Just a moment")) {
        throw new Error("Still blocked by Cloudflare after extended wait. Try --headed.");
      }
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(`[energy-price] Extracted ${bodyText.length} chars of page text`);

    return parseSupplierOffers(bodyText);
  } finally {
    await browser.close();
  }
}

// ── DB Persistence ──────────────────────────────────────────────────────────

export async function storeOffers(offers: SupplierOffer[]): Promise<void> {
  await db.$transaction([
    // Mark all existing rows inactive
    db.energyPrice.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    }),
    // Insert new rows in bulk
    ...(offers.length > 0
      ? [db.energyPrice.createMany({ data: offers })]
      : []
    ),
    // Update last-scraped timestamp
    db.setting.upsert({
      where: { key: "energy_price:last_scraped_at" },
      create: { key: "energy_price:last_scraped_at", value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    }),
  ]);

  console.log(`[energy-price] Stored ${offers.length} offers (old rows deactivated)`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[energy-price] === Energy Price Scraper ===`);

  const utility = process.env.ENERGY_PRICE_UTILITY || "ev";
  const usage = parseInt(process.env.ENERGY_PRICE_USAGE || String(DEFAULT_USAGE), 10);
  const headed = process.env.ENERGY_PRICE_HEADED === "1";

  console.log(`[energy-price] Utility: ${UTILITIES[utility]?.name ?? utility}`);
  console.log(`[energy-price] Usage: ${usage} kWh/mo`);
  if (headed) console.warn("[energy-price] Headed mode — browser will be visible");

  const offers = await scrapeEnergizeCT(utility, usage, headed);
  console.log(`[energy-price] Found ${offers.length} unique offers`);

  if (offers.length === 0) {
    console.warn("[energy-price] No offers found — nothing to store");
    return;
  }

  await storeOffers(offers);

  // Log summary
  const rates = offers.filter(o => o.rate > 0).map(o => o.rate);
  console.log(`[energy-price] Offers: ${offers.length}`);
  console.log(`[energy-price] Cheapest: ${Math.min(...rates).toFixed(2)}¢/kWh`);
  console.log(`[energy-price] Dearest: ${Math.max(...rates).toFixed(2)}¢/kWh`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("[energy-price] Energy price scraper failed", err);
    process.exit(1);
  });
}
