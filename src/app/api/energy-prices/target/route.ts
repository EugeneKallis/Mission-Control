/**
 * PUT /api/energy-prices/target — update user's target rate
 *
 * Body: { rate: number }  // in ¢/kWh
 *
 * Returns: { targetRate: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const rate = parseFloat(body.rate);

  if (isNaN(rate) || rate < 0 || rate > 100) {
    return NextResponse.json({ error: "Invalid rate (must be 0-100 ¢/kWh)" }, { status: 400 });
  }

  await db.setting.upsert({
    where: { key: "energy_price:target_rate" },
    create: { key: "energy_price:target_rate", value: String(rate) },
    update: { value: String(rate) },
  });

  return NextResponse.json({ targetRate: rate });
}
