/**
 * GET /api/energy-prices/history?days=N — historical rates for the chart
 *
 * Returns one entry per supplier per scrape within the last `days`
 * days. The chart reuses the time-series already stored in
 * `energy_prices` (every scrape preserves old rows; only flips
 * `isActive=false`), so no separate history table is needed.
 *
 * Response:
 *   {
 *     days: number,                            // echoed back
 *     targetRate: number | null,               // user's target (from settings)
 *     sinceIso: string,                        // cutoff timestamp used
 *     suppliers: [
 *       {
 *         name: string,
 *         points: [{ t: string, rate: number }, ...]
 *       },
 *       ...
 *     ]
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_DAYS = new Set([7, 30, 60, 120, 365]);
const DEFAULT_DAYS = 30;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const daysParam = parseInt(url.searchParams.get("days") ?? String(DEFAULT_DAYS), 10);
  const days = VALID_DAYS.has(daysParam) ? daysParam : DEFAULT_DAYS;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [rows, targetSetting] = await Promise.all([
    db.energyPrice.findMany({
      where: { fetchedAt: { gte: since } },
      orderBy: { fetchedAt: "asc" },
      select: { supplier: true, rate: true, fetchedAt: true },
    }),
    db.setting.findUnique({ where: { key: "energy_price:target_rate" } }),
  ]);

  const targetRateValue =
    targetSetting?.value != null ? parseFloat(targetSetting.value) : null;

  // Group rows by supplier (preserving time order). Supplier names
  // are emitted as-is — EnergizeCT already canonicalizes them in the
  // scraper's deduplication step.
  const map = new Map<string, { t: string; rate: number }[]>();
  for (const r of rows) {
    const name = r.supplier ?? "";
    if (!name) continue; // skip rows with no supplier name (shouldn't exist)
    const list = map.get(name) ?? [];
    list.push({
      t: r.fetchedAt.toISOString(),
      rate: r.rate,
    });
    map.set(name, list);
  }

  const suppliers = Array.from(map.entries())
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(
    {
      days,
      targetRate: targetRateValue,
      sinceIso: since.toISOString(),
      suppliers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
