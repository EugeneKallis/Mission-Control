/**
 * GET /api/energy-prices — returns latest snapshot + user's target rate
 *
 * Response:
 *   {
 *     offers: SupplierOffer[],
 *     targetRate: number | null,       // user's target in ¢/kWh
 *     hasBetter: boolean,              // any offer <= targetRate
 *     betterCount: number,             // offers at or below target
 *     lastScrapedAt: string | null,    // ISO timestamp
 *   }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [offers, targetSetting, lastScrapedSetting] = await Promise.all([
    db.energyPrice.findMany({
      where: { isActive: true },
      orderBy: { rate: "asc" },
    }),
    db.setting.findUnique({ where: { key: "energy_price:target_rate" } }),
    db.setting.findUnique({ where: { key: "energy_price:last_scraped_at" } }),
  ]);

  const targetRate = targetSetting?.value ? parseFloat(targetSetting.value) : null;
  const lastScrapedAt = lastScrapedSetting?.value ?? null;

  let hasBetter = false;
  let betterCount = 0;
  if (targetRate !== null) {
    betterCount = offers.filter((o) => o.rate <= targetRate && o.supplier !== "Eversource - Standard Service").length;
    hasBetter = betterCount > 0;
  }

  return NextResponse.json({
    offers,
    targetRate,
    hasBetter,
    betterCount,
    lastScrapedAt,
  });
}
