export type ConfigFieldKind = "text" | "secret" | "url" | "integer" | "number" | "date" | "textarea" | "boolean";

export type ConfigFieldGroup = "media" | "downloads" | "monitoring";

export interface ConfigFieldDefinition {
  key: string;
  group: ConfigFieldGroup;
  label: string;
  description: string;
  kind: ConfigFieldKind;
  placeholder?: string;
  defaultValue?: string;
}

export const CONFIG_FIELDS = [
  { key: "pulse_api_key", group: "monitoring", label: "Pulse API Key", description: "Read-only token from Pulse API Access settings.", kind: "secret", placeholder: "Enter your Pulse API key" },
  { key: "plex_token", group: "media", label: "Plex Token", description: "Plex authentication token used for libraries and activity.", kind: "secret", placeholder: "Enter your Plex token" },
  { key: "plex_url", group: "media", label: "Plex Server URL", description: "Local Plex server address including port.", kind: "url", placeholder: "http://192.168.1.x:32400" },
  { key: "real_debrid_api_key", group: "downloads", label: "Real-Debrid API Key", description: "API token from your Real-Debrid account.", kind: "secret", placeholder: "Enter your Real-Debrid API key" },
  { key: "zurg_url", group: "downloads", label: "Zurg URL", description: "Base URL used by downloads, the queue cleaner, and integration health.", kind: "url", placeholder: "http://192.168.1.x:9999", defaultValue: "http://192.168.1.99:9999" },
  { key: "zurg_api_key", group: "downloads", label: "Zurg API Key", description: "Bearer API key used to authenticate with Zurg.", kind: "secret", placeholder: "Enter your Zurg API key" },
] as const satisfies readonly ConfigFieldDefinition[];

export type ConfigKey = (typeof CONFIG_FIELDS)[number]["key"];

export const CONFIG_FIELD_MAP = new Map(CONFIG_FIELDS.map((field) => [field.key, field]));

export function defaultConfigValues(): Record<ConfigKey, string> {
  return Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, "defaultValue" in field ? field.defaultValue : ""])) as Record<ConfigKey, string>;
}

export function fieldsForGroup(group: ConfigFieldGroup): readonly ConfigFieldDefinition[] {
  return CONFIG_FIELDS.filter((field) => field.group === group);
}
