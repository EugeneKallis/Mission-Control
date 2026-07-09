/**
 * POST /api/energy-prices/refresh — trigger a scrape now
 *
 * Runs the scraper synchronously (may take 20-40s due to
 * Cloudflare challenge + page render). Returns the scraped offers.
 */
import { NextResponse } from "next/server";
import { scrapeEnergizeCT, storeOffers } from "@/workers/energy-price-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for the scrape

export async function POST() {
  const utility = process.env.ENERGY_PRICE_UTILITY || "ev";
  const usage = parseInt(process.env.ENERGY_PRICE_USAGE || "750", 10);

  try {
    const offers = await scrapeEnergizeCT(utility, usage, false);
    await storeOffers(offers);

    return NextResponse.json({
      ok: true,
      count: offers.length,
      offers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
