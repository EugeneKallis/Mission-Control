import { describe, expect, test } from "bun:test";
import { CONFIG_FIELDS, defaultConfigValues, fieldsForGroup } from "./config-fields";

describe("global config field registry", () => {
  test("has unique database keys", () => {
    expect(new Set(CONFIG_FIELDS.map((field) => field.key)).size).toBe(CONFIG_FIELDS.length);
  });

  test("provides a default string for every field", () => {
    const values = defaultConfigValues();
    expect(Object.keys(values).length).toBe(CONFIG_FIELDS.length);
    for (const field of CONFIG_FIELDS) expect(typeof values[field.key]).toBe("string");
  });

  test("fieldsForGroup partitions the five fields into the three groups", () => {
    const media = fieldsForGroup("media").map((field) => field.key);
    const downloads = fieldsForGroup("downloads").map((field) => field.key);
    const monitoring = fieldsForGroup("monitoring").map((field) => field.key);
    expect(media).toEqual(["plex_token", "plex_url"]);
    expect(downloads).toEqual(["real_debrid_api_key", "decypharr_url"]);
    expect(monitoring).toEqual(["pulse_api_key"]);
    expect([...media, ...downloads, ...monitoring].sort()).toEqual(CONFIG_FIELDS.map((field) => field.key).sort());
  });
});
