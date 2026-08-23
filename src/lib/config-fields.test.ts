import { describe, expect, test } from "bun:test";
import { CONFIG_FIELDS, configSections, defaultConfigValues } from "./config-fields";

describe("global config field registry", () => {
  test("has unique database and environment keys", () => {
    expect(new Set(CONFIG_FIELDS.map((field) => field.key)).size).toBe(CONFIG_FIELDS.length);
    expect(new Set(CONFIG_FIELDS.map((field) => field.envKey)).size).toBe(CONFIG_FIELDS.length);
  });

  test("provides a default string for every field", () => {
    const values = defaultConfigValues();
    expect(Object.keys(values).length).toBe(CONFIG_FIELDS.length);
    for (const field of CONFIG_FIELDS) expect(typeof values[field.key]).toBe("string");
  });

  test("groups every field into one Config page section", () => {
    expect(configSections().flatMap((section) => section.fields)).toHaveLength(CONFIG_FIELDS.length);
  });
});
