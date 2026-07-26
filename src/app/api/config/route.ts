import { NextResponse } from "next/server";
import { getConfig, upsertConfig } from "@/lib/db/queries";
import { z } from "zod";
import { arrConfigDbKey, ARR_INSTANCE_DEFINITIONS, ARR_CONFIG_DB_KEYS } from "@/lib/arr-config";

// URL validation: must be http:// or https:// or empty (to clear stored override).
// Trim whitespace before validation so "  http://..." is accepted.
const arrUrlSchema = z
  .string()
  .optional()
  .transform((val) => (val === undefined ? undefined : val.trim()))
  .refine(
    (val) => val === undefined || val === "" || val.startsWith("http://") || val.startsWith("https://"),
    { message: "URL must start with http:// or https://" },
  );

// Build the schema from canonical definitions: URL keys get URL validation,
// API-key keys are plain optional strings.
const configSchema = z.object({
  real_debrid_api_key: z.string().optional(),
  plex_token: z.string().optional(),
  plex_url: z.string().optional(),
  ...Object.fromEntries(
    ARR_INSTANCE_DEFINITIONS.flatMap((def) => [
      [arrConfigDbKey(def.slug, "url"), arrUrlSchema],
      [arrConfigDbKey(def.slug, "api_key"), z.string().optional()],
    ]),
  ),
});

function noStoreResponse(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET() {
  try {
    const config = await getConfig();
    const values = JSON.parse(config.configJson) as Record<string, string>;
    return noStoreResponse(values);
  } catch (error) {
    console.error("Failed to fetch config:", error);
    return noStoreResponse({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Only allow whitelisted keys — trim all input values
    const sanitized: Record<string, string> = {};
    if (typeof parsed.data.real_debrid_api_key === "string") {
      sanitized.real_debrid_api_key = parsed.data.real_debrid_api_key.trim();
    }
    if (typeof parsed.data.plex_token === "string") {
      sanitized.plex_token = parsed.data.plex_token.trim();
    }
    if (typeof parsed.data.plex_url === "string") {
      sanitized.plex_url = parsed.data.plex_url.trim();
    }
    for (const key of ARR_CONFIG_DB_KEYS) {
      const val = (parsed.data as Record<string, string | undefined>)[key];
      if (val !== undefined) {
        sanitized[key] = val.trim();
      }
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

    return noStoreResponse(merged);
  } catch (error) {
    console.error("Failed to save config:", error);
    return noStoreResponse({ error: "Failed to save config" }, { status: 500 });
  }
}
