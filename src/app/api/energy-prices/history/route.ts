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
 *         active: boolean,
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
      select: { supplier: true, rate: true, fetchedAt: true, isActive: true },
    }),
    db.setting.findUnique({ where: { key: "energy_price:target_rate" } }),
  ]);

  const parsedTargetRate =
    targetSetting?.value != null ? Number.parseFloat(targetSetting.value) : NaN;
  const targetRateValue = Number.isFinite(parsedTargetRate) ? parsedTargetRate : null;

  // Keep one point per supplier per scrape. A supplier can publish multiple
  // offers in the same scrape; the chart represents its cheapest rate rather
  // than drawing a misleading vertical line between simultaneous offers.
  const map = new Map<
    string,
    { active: boolean; pointsByTime: Map<string, number> }
  >();
  for (const row of rows) {
    const time = row.fetchedAt.toISOString();
    const supplier = map.get(row.supplier) ?? {
      active: false,
      pointsByTime: new Map<string, number>(),
    };
    const existingRate = supplier.pointsByTime.get(time);
    supplier.pointsByTime.set(
      time,
      existingRate === undefined ? row.rate : Math.min(existingRate, row.rate),
    );
    supplier.active ||= row.isActive;
    map.set(row.supplier, supplier);
  }

  const suppliers = Array.from(map.entries())
    .map(([name, supplier]) => ({
      name,
      active: supplier.active,
      points: Array.from(supplier.pointsByTime, ([t, rate]) => ({ t, rate })),
    }))
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
