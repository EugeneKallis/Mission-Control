import { NextResponse } from "next/server";
import { getConfig, upsertConfig } from "@/lib/db/queries";
import { z } from "zod";
import { arrConfigDbKey, ARR_INSTANCE_DEFINITIONS, ARR_CONFIG_DB_KEYS } from "@/lib/arr-config";
import { CONFIG_FIELDS, defaultConfigValues, type ConfigFieldDefinition } from "@/lib/config-fields";

const stringSchema = z.string().optional().transform((value) => value?.trim());
const urlSchema = stringSchema.refine(
  (value) => value === undefined || value === "" || value.startsWith("http://") || value.startsWith("https://"),
  { message: "URL must start with http:// or https://" },
);

function schemaFor(field: ConfigFieldDefinition) {
  if (field.kind === "url") return urlSchema;
  if (field.kind === "integer") {
    return stringSchema.refine((value) => value === undefined || value === "" || (/^\d+$/.test(value) && Number(value) > 0), { message: "Value must be a positive integer" });
  }
  if (field.kind === "number") {
    return stringSchema.refine((value) => value === undefined || value === "" || Number.isFinite(Number(value)), { message: "Value must be a number" });
  }
  if (field.kind === "date") {
    return stringSchema.refine((value) => value === undefined || value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), { message: "Value must be a date" });
  }
  if (field.kind === "boolean") {
    return stringSchema.refine((value) => value === undefined || value === "true" || value === "false", { message: "Value must be true or false" });
  }
  return stringSchema;
}

const configSchema = z.object({
  ...Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, schemaFor(field)])),
  ...Object.fromEntries(
    ARR_INSTANCE_DEFINITIONS.flatMap((def) => [
      [arrConfigDbKey(def.slug, "url"), urlSchema],
      [arrConfigDbKey(def.slug, "api_key"), stringSchema],
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
    return noStoreResponse({ ...defaultConfigValues(), ...values });
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

    // Only allow canonical global and Arr keys.
    const sanitized: Record<string, string> = {};
    for (const key of [...CONFIG_FIELDS.map((field) => field.key), ...ARR_CONFIG_DB_KEYS]) {
      const value = (parsed.data as Record<string, string | undefined>)[key];
      if (value !== undefined) sanitized[key] = value;
    }

    // Load existing to preserve unset keys
    let existing: Record<string, string> = defaultConfigValues();
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
