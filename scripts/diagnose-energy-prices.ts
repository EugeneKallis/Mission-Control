#!/usr/bin/env bun
/**
 * Diagnostic script to check energy prices state
 */

import { db } from "@/lib/db";

async function main() {
  console.log("=== Energy Prices Diagnostic ===\n");

  // Check target rate setting
  const targetRateSetting = await db.setting.findUnique({
    where: { key: "energy_price:target_rate" },
  });
  console.log("Target Rate Setting:");
  console.log(
    targetRateSetting
      ? `  ${targetRateSetting.value} ¢/kWh`
      : "  NOT SET\n"
  );

  // Check last scraped timestamp
  const lastScrapedSetting = await db.setting.findUnique({
    where: { key: "energy_price:last_scraped_at" },
  });
  console.log("\nLast Scraped At:");
  console.log(
    lastScrapedSetting
      ? `  ${lastScrapedSetting.value}`
      : "  NEVER SCRAPED"
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
      console.log(
        `  ${i + 1}. ${o.supplier}: ${o.rate.toFixed(2)}¢/kWh ($${o.monthlyCost.toFixed(2)}/mo)`
      );
    });

    // Calculate better count if target is set
    if (targetRateSetting) {
      const targetRate = parseFloat(targetRateSetting.value);
      const betterCount = offers.filter(
        (o) => o.rate <= targetRate && o.supplier !== "Eversource - Standard Service"
      ).length;
      console.log(`\nOffers beating target (${targetRate}¢/kWh): ${betterCount}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
