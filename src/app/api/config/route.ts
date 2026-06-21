import { NextResponse } from "next/server";
import { getConfig, upsertConfig } from "@/lib/db/queries";
import { z } from "zod";

const configSchema = z.object({
  real_debrid_api_key: z.string().optional(),
});

export async function GET() {
  try {
    const config = await getConfig();
    const values = JSON.parse(config.configJson) as Record<string, string>;
    return NextResponse.json(values);
  } catch (error) {
    console.error("Failed to fetch config:", error);
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Only allow whitelisted keys
    const sanitized: Record<string, string> = {};
    if (parsed.data.real_debrid_api_key !== undefined) {
      sanitized.real_debrid_api_key = parsed.data.real_debrid_api_key;
    }

    // Load existing to preserve unset keys
    let existing: Record<string, string> = {};
    try {
      const config = await getConfig();
      existing = JSON.parse(config.configJson);
    } catch {
      // No existing config
    }

    const merged = { ...existing, ...sanitized };
    await upsertConfig(JSON.stringify(merged));

    return NextResponse.json(merged);
  } catch (error) {
    console.error("Failed to save config:", error);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
