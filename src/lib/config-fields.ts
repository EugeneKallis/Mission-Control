export type ConfigFieldKind = "text" | "secret" | "url" | "integer" | "number" | "date" | "textarea" | "boolean";

export interface ConfigFieldDefinition {
  key: string;
  envKey: string;
  section: string;
  label: string;
  description: string;
  kind: ConfigFieldKind;
  placeholder?: string;
  defaultValue?: string;
}

export const CONFIG_FIELDS = [
  { key: "pulse_api_key", envKey: "PULSE_API_KEY", section: "Current integrations", label: "Pulse API Key", description: "Read-only token from Pulse API Access settings.", kind: "secret", placeholder: "Enter your Pulse API key" },
  { key: "plex_token", envKey: "PLEX_TOKEN", section: "Current integrations", label: "Plex Token", description: "Plex authentication token used for libraries and activity.", kind: "secret", placeholder: "Enter your Plex token" },
  { key: "plex_url", envKey: "PLEX_URL", section: "Current integrations", label: "Plex Server URL", description: "Local Plex server address including port.", kind: "url", placeholder: "http://192.168.1.x:32400" },
  { key: "real_debrid_api_key", envKey: "REAL_DEBRID_API_KEY", section: "Current integrations", label: "Real-Debrid API Key", description: "API token from your Real-Debrid account.", kind: "secret", placeholder: "Enter your Real-Debrid API key" },
  { key: "decypharr_url", envKey: "DECYPHARR_URL", section: "Current integrations", label: "Decypharr URL", description: "Base URL used by downloads, the magnet bridge, and integration health.", kind: "url", placeholder: "http://192.168.1.x:8282", defaultValue: "http://192.168.1.99:8282" },
  { key: "dozzle_endpoints", envKey: "DOZZLE_ENDPOINTS", section: "Current integrations", label: "Dozzle Endpoints", description: "One Name=http://url endpoint per line for Docker log health checks.", kind: "textarea", placeholder: "Docker 1=http://192.168.1.10:8080\nDocker 2=http://192.168.1.11:8080" },

  { key: "prowlarr_url", envKey: "PROWLARR_URL", section: "Media pipeline", label: "Prowlarr URL", description: "Base URL for end-to-end media pipeline and indexer health.", kind: "url", placeholder: "http://192.168.1.x:9696" },
  { key: "prowlarr_api_key", envKey: "PROWLARR_API_KEY", section: "Media pipeline", label: "Prowlarr API Key", description: "Read-only API key for indexer and application status.", kind: "secret" },
  { key: "tautulli_url", envKey: "TAUTULLI_URL", section: "Media pipeline", label: "Tautulli URL", description: "Optional Tautulli server for Plex activity and buffering data.", kind: "url", placeholder: "http://192.168.1.x:8181" },
  { key: "tautulli_api_key", envKey: "TAUTULLI_API_KEY", section: "Media pipeline", label: "Tautulli API Key", description: "API key generated in Tautulli settings.", kind: "secret" },
  { key: "arr_queue_stalled_minutes", envKey: "ARR_QUEUE_STALLED_MINUTES", section: "Media pipeline", label: "Arr Queue Stalled Threshold", description: "Minutes before a queue item is considered stalled.", kind: "integer", defaultValue: "30" },

  { key: "telegram_bot_token", envKey: "TELEGRAM_BOT_TOKEN", section: "Notifications", label: "Telegram Bot Token", description: "Bot token used by incident notifications.", kind: "secret" },
  { key: "telegram_chat_id", envKey: "TELEGRAM_CHAT_ID", section: "Notifications", label: "Telegram Chat ID", description: "Destination user, group, or channel ID.", kind: "text" },
  { key: "notification_webhook_url", envKey: "NOTIFICATION_WEBHOOK_URL", section: "Notifications", label: "Webhook URL", description: "Optional generic incident webhook destination.", kind: "url" },
  { key: "smtp_host", envKey: "SMTP_HOST", section: "Notifications", label: "SMTP Host", description: "Optional SMTP server for email notifications.", kind: "text" },
  { key: "smtp_port", envKey: "SMTP_PORT", section: "Notifications", label: "SMTP Port", description: "SMTP server port.", kind: "integer", defaultValue: "587" },
  { key: "smtp_username", envKey: "SMTP_USERNAME", section: "Notifications", label: "SMTP Username", description: "Optional SMTP authentication username.", kind: "text" },
  { key: "smtp_password", envKey: "SMTP_PASSWORD", section: "Notifications", label: "SMTP Password", description: "Optional SMTP authentication password.", kind: "secret" },
  { key: "smtp_from", envKey: "SMTP_FROM", section: "Notifications", label: "Email From", description: "Sender address for alert email.", kind: "text", placeholder: "mission-control@example.com" },
  { key: "smtp_to", envKey: "SMTP_TO", section: "Notifications", label: "Email To", description: "Recipient address for alert email.", kind: "text" },

  { key: "internet_gateway_host", envKey: "INTERNET_GATEWAY_HOST", section: "Network and power", label: "Gateway Host", description: "Gateway or upstream host used for reachability and packet-loss checks.", kind: "text", placeholder: "192.168.1.1" },
  { key: "internet_dns_host", envKey: "INTERNET_DNS_HOST", section: "Network and power", label: "DNS Test Host", description: "Hostname resolved during DNS quality checks.", kind: "text", placeholder: "example.com" },
  { key: "internet_speedtest_enabled", envKey: "INTERNET_SPEEDTEST_ENABLED", section: "Network and power", label: "Enable Speed Tests", description: "Run optional bounded speed tests with internet quality checks.", kind: "boolean", defaultValue: "false" },
  { key: "internet_check_interval_minutes", envKey: "INTERNET_CHECK_INTERVAL_MINUTES", section: "Network and power", label: "Internet Check Interval", description: "Minutes between internet quality samples.", kind: "integer", defaultValue: "5" },
  { key: "nut_host", envKey: "NUT_HOST", section: "Network and power", label: "NUT Host", description: "Host running Network UPS Tools for UPS readiness.", kind: "text" },
  { key: "nut_port", envKey: "NUT_PORT", section: "Network and power", label: "NUT Port", description: "Network UPS Tools server port.", kind: "integer", defaultValue: "3493" },
  { key: "nut_username", envKey: "NUT_USERNAME", section: "Network and power", label: "NUT Username", description: "Optional Network UPS Tools username.", kind: "text" },
  { key: "nut_password", envKey: "NUT_PASSWORD", section: "Network and power", label: "NUT Password", description: "Optional Network UPS Tools password.", kind: "secret" },

  { key: "automation_stale_minutes", envKey: "AUTOMATION_STALE_MINUTES", section: "Automation and retention", label: "Automation Stale Threshold", description: "Minutes after an expected run before automation is considered silent.", kind: "integer", defaultValue: "30" },
  { key: "pve_backup_stale_hours", envKey: "PVE_BACKUP_STALE_HOURS", section: "Automation and retention", label: "Proxmox Backup Stale Threshold", description: "Hours after the latest successful backup before warning.", kind: "integer", defaultValue: "48" },
  { key: "audit_retention_days", envKey: "AUDIT_RETENTION_DAYS", section: "Automation and retention", label: "Audit Retention", description: "Days to retain action audit records.", kind: "integer", defaultValue: "365" },
  { key: "capacity_retention_days", envKey: "CAPACITY_RETENTION_DAYS", section: "Automation and retention", label: "Capacity History Retention", description: "Days of capacity samples to retain.", kind: "integer", defaultValue: "90" },
  { key: "history_retention_days", envKey: "HISTORY_RETENTION_DAYS", section: "Automation and retention", label: "Execution History Retention", description: "Days of command and synthetic journey history to retain.", kind: "integer", defaultValue: "90" },
  { key: "cleanup_min_age_days", envKey: "CLEANUP_MIN_AGE_DAYS", section: "Automation and retention", label: "Cleanup Minimum Age", description: "Minimum age in days before the cleanup advisor recommends an item.", kind: "integer", defaultValue: "30" },
  { key: "cleanup_paths", envKey: "CLEANUP_PATHS", section: "Automation and retention", label: "Cleanup Paths", description: "One allowlisted root per line for storage cleanup analysis.", kind: "textarea", placeholder: "/mnt/debrid/downloads\n/var/log/mission-control" },
  { key: "disk_health_devices", envKey: "DISK_HEALTH_DEVICES", section: "Automation and retention", label: "Disk Health Devices", description: "Optional node=device mappings, one per line, for SMART checks.", kind: "textarea", placeholder: "pve1=/dev/sda,/dev/nvme0n1" },

  { key: "calendar_ical_url", envKey: "CALENDAR_ICAL_URL", section: "Personal alerts", label: "Private iCalendar URL", description: "Private calendar feed for the personal agenda card.", kind: "secret" },
  { key: "weather_latitude", envKey: "WEATHER_LATITUDE", section: "Personal alerts", label: "Weather Latitude", description: "Latitude used for severe-weather alert matching.", kind: "number", placeholder: "41.7658" },
  { key: "weather_longitude", envKey: "WEATHER_LONGITUDE", section: "Personal alerts", label: "Weather Longitude", description: "Longitude used for severe-weather alert matching.", kind: "number", placeholder: "-72.6734" },
  { key: "weather_state", envKey: "WEATHER_STATE", section: "Personal alerts", label: "Weather State", description: "Two-letter state code used by weather alerts.", kind: "text", placeholder: "CT" },
  { key: "energy_monthly_kwh", envKey: "ENERGY_MONTHLY_KWH", section: "Personal alerts", label: "Monthly Electricity Usage", description: "Typical monthly kWh used to estimate supplier savings.", kind: "number", placeholder: "700" },
  { key: "energy_contract_end", envKey: "ENERGY_CONTRACT_END", section: "Personal alerts", label: "Energy Contract End", description: "Current supplier contract end date for renewal reminders.", kind: "date" },

  { key: "komodo_url", envKey: "KOMODO_URL", section: "Updates and diagnostics", label: "Komodo URL", description: "Optional Komodo endpoint for the update inbox.", kind: "url" },
  { key: "komodo_api_key", envKey: "KOMODO_API_KEY", section: "Updates and diagnostics", label: "Komodo API Key", description: "Read-only API key for Komodo update status.", kind: "secret" },
  { key: "diagnostic_ssh_targets", envKey: "DIAGNOSTIC_SSH_TARGETS", section: "Updates and diagnostics", label: "Diagnostic SSH Targets", description: "Allowlisted name=user@host mappings, one per line, for read-only snapshots.", kind: "textarea", placeholder: "media=user@192.168.1.10" },
] as const satisfies readonly ConfigFieldDefinition[];

export type ConfigKey = (typeof CONFIG_FIELDS)[number]["key"];

export const CONFIG_FIELD_MAP = new Map(CONFIG_FIELDS.map((field) => [field.key, field]));

export function defaultConfigValues(): Record<ConfigKey, string> {
  return Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, "defaultValue" in field ? field.defaultValue : ""])) as Record<ConfigKey, string>;
}

export function configSections(): { name: string; fields: readonly ConfigFieldDefinition[] }[] {
  const sections = new Map<string, ConfigFieldDefinition[]>();
  for (const field of CONFIG_FIELDS) sections.set(field.section, [...(sections.get(field.section) ?? []), field]);
  return [...sections].map(([name, fields]) => ({ name, fields }));
}
