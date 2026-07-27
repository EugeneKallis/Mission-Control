#!/usr/bin/env bun
/**
 * Diagnostic script to check energy prices state
 */

import { db } from "@/lib/db";

export async function main(argv?: string[]) {
  // No options needed — this is a read-only diagnostic.
  // Accepting argv keeps the export signature consistent across scripts.
  void argv;

  console.log("=== Energy Prices Diagnostic ===\n");

  // Check target rate setting
  const targetRateSetting = await db.setting.findUnique({
    where: { key: "energy_price:target_rate" },
  });
  console.log("Target Rate Setting:");
  console.log(
    targetRateSetting
      ? `  ${targetRateSetting.value} ¢/kWh`
      : "  NOT SET\n",
  );

  // Check last scraped timestamp
  const lastScrapedSetting = await db.setting.findUnique({
    where: { key: "energy_price:last_scraped_at" },
  });
  console.log("\nLast Scraped At:");
  console.log(
    lastScrapedSetting
      ? `  ${lastScrapedSetting.value}`
      : "  NEVER SCRAPED",
  );

  // Count active offers
  const activeCount = await db.energyPrice.count({
    where: { isActive: true },
  });
  console.log(`\nActive Offers: ${activeCount}`);

  // Count total offers
  const totalCount = await db.energyPrice.count();
  console.log(`Total Offers: ${totalCount}`);

  // Show top 10 cheapest active offers
  if (activeCount > 0) {
    const offers = await db.energyPrice.findMany({
      where: { isActive: true },
      orderBy: { rate: "asc" },
      take: 10,
      select: {
        supplier: true,
        rate: true,
        monthlyCost: true,
        isActive: true,
      },
    });

    console.log("\nTop 10 Cheapest Active Offers:");
    offers.forEach((o, i) => {
      const rate = o.rate ?? 0;
      const cost = o.monthlyCost ?? 0;
      console.log(
        `  ${i + 1}. ${o.supplier}: ${rate.toFixed(2)}¢/kWh ($${cost.toFixed(2)}/mo)`,
      );
    });

    // Calculate better count if target is set
    if (targetRateSetting?.value) {
      const targetRate = parseFloat(targetRateSetting.value);
      if (!isNaN(targetRate)) {
        const betterCount = offers.filter(
          (o) => (o.rate ?? Infinity) <= targetRate && o.supplier !== "Eversource - Standard Service",
        ).length;
        console.log(`\nOffers beating target (${targetRate}¢/kWh): ${betterCount}`);
      }
    }
  }
}

if (import.meta.main) {
  main()
    .catch(console.error)
    .finally(() => db.$disconnect());
}
