/**
 * Runtime configuration loader.
 * Loads and validates config from env vars with sensible defaults.
 * Mirrors ~/ServerTool/config/config.go
 *
 * Arr instance configuration is owned by src/lib/arr-config.ts.
 * This module imports the canonical definitions and resolution from there
 * rather than maintaining its own instance list.
 */

import { z } from "zod";
import type { ArrInstance } from "@/types";
import {
  resolveArrInstances as resolveArrInstancesFromDefs,
  arrConfigDbKey,
  ARR_INSTANCE_DEFINITIONS,
} from "./arr-config";

// ── Schema ────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().default("file:./dev.db"),

  // Server
  WEB_PORT: z.coerce.number().default(8080),

  // Media paths (from ServerTool config)
  RCLONE_PATH: z.string().default("/mnt/addons/debrid/__all__"),
  MEDIA_BASE_PATH: z.string().default("/mnt/debrid/media/"),
  MEDIA_DIRECTORIES: z
    .string()
    .default("movies,movies4k,moviesanime,movieskids,movieslocal,special,tv,tv4k,tvanime,tvkids,tvlocal"),

  // External service keys
  DECYPHARR_URL: z.string().default("http://192.168.1.99:8282"),
  REAL_DEBRID_API_KEY: z.string().default(""),

  // Plex
  PLEX_TOKEN: z.string().default(""),
  PLEX_URL: z.string().default(""),
  PLEX_WATCHLIST_RSS: z.string().default(""),

  // Trakt
  TRAKT_CLIENT_ID: z.string().default(""),
  TRAKT_CLIENT_SECRET: z.string().default(""),

  // Chat / LLM provider API keys (used by /chat). Empty = provider unavailable.
  OPENCODE_GO_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),

  // Arr instance API keys (override hardcoded defaults per instance)
  ARR__RADARR__API_KEY: z.string().default(""),
  ARR__RADARR4K__API_KEY: z.string().default(""),
  ARR__RADARRKIDS__API_KEY: z.string().default(""),
  ARR__RADARRANIME__API_KEY: z.string().default(""),
  ARR__RADARRLOCAL__API_KEY: z.string().default(""),
  ARR__SONARR__API_KEY: z.string().default(""),
  ARR__SONARR4K__API_KEY: z.string().default(""),
  ARR__SONARRKIDS__API_KEY: z.string().default(""),
  ARR__SONARRANIME__API_KEY: z.string().default(""),
  ARR__SONARRLOCAL__API_KEY: z.string().default(""),

  // Arr instance URLs (override hardcoded defaults per instance)
  ARR__RADARR__URL: z.string().default(""),
  ARR__RADARR4K__URL: z.string().default(""),
  ARR__RADARRKIDS__URL: z.string().default(""),
  ARR__RADARRANIME__URL: z.string().default(""),
  ARR__RADARRLOCAL__URL: z.string().default(""),
  ARR__SONARR__URL: z.string().default(""),
  ARR__SONARR4K__URL: z.string().default(""),
  ARR__SONARRKIDS__URL: z.string().default(""),
  ARR__SONARRANIME__URL: z.string().default(""),
  ARR__SONARRLOCAL__URL: z.string().default(""),
});

export type EnvConfig = z.infer<typeof envSchema>;

// ── Resolve (env only, no DB) ─────────────────────────────────────────────

/**
 * Resolve Arr instances from environment variables only.
 * Delegates to the canonical module with empty DB values.
 * Precedence: env > built-in default.
 */
function resolveArrInstances(env: EnvConfig): ArrInstance[] {
  return resolveArrInstancesFromDefs(env as unknown as Record<string, string>);
}

// ── Runtime config object ─────────────────────────────────────────────────

export class AppConfig {
  readonly databaseUrl: string;
  readonly webPort: number;
  readonly rclonePath: string;
  readonly mediaBasePath: string;
  readonly mediaDirectories: string[];
  readonly decypharrUrl: string;
  readonly realDebridApiKey: string;
  readonly plexToken: string;
  readonly plexUrl: string;
  readonly plexWatchlistRss: string;
  readonly traktClientId: string;
  readonly traktClientSecret: string;
  readonly opencodeGoApiKey: string;
  readonly openaiApiKey: string;
  readonly anthropicApiKey: string;
  readonly geminiApiKey: string;
  readonly arrInstances: ArrInstance[];

  constructor(env: EnvConfig) {
    this.databaseUrl = env.DATABASE_URL;
    this.webPort = env.WEB_PORT;
    this.rclonePath = env.RCLONE_PATH;
    this.mediaBasePath = env.MEDIA_BASE_PATH;
    this.mediaDirectories = env.MEDIA_DIRECTORIES.split(",").map((s) => s.trim()).filter(Boolean);
    this.decypharrUrl = env.DECYPHARR_URL;
    this.realDebridApiKey = env.REAL_DEBRID_API_KEY;
    this.plexToken = env.PLEX_TOKEN;
    this.plexUrl = env.PLEX_URL;
    this.plexWatchlistRss = env.PLEX_WATCHLIST_RSS;
    this.traktClientId = env.TRAKT_CLIENT_ID;
    this.traktClientSecret = env.TRAKT_CLIENT_SECRET;
    this.opencodeGoApiKey = env.OPENCODE_GO_API_KEY;
    this.openaiApiKey = env.OPENAI_API_KEY;
    this.anthropicApiKey = env.ANTHROPIC_API_KEY;
    this.geminiApiKey = env.GEMINI_API_KEY;
    this.arrInstances = resolveArrInstances(env);
  }

  get fullMediaPaths(): string[] {
    return this.mediaDirectories.map((d) => `${this.mediaBasePath}${d}`);
  }
}

// ── DB config key mapping ─────────────────────────────────────────────────

/**
 * Maps DB config JSON keys (from the configs table) to EnvConfig keys
 * so resolveConfig() can fall back to the admin config page's stored values.
 * Only string-valued fields are supported (no ports, paths, booleans).
 */
const DB_ENV_KEY_MAP: Record<string, keyof EnvConfig> = {
  plex_token: "PLEX_TOKEN",
  plex_url: "PLEX_URL",
  real_debrid_api_key: "REAL_DEBRID_API_KEY",
};

// ── Singleton (env-only) ─────────────────────────────────────────────────

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;
  const env = envSchema.parse(process.env);
  _config = new AppConfig(env);
  return _config;
}

/**
 * Resolve config with DB fallback.
 *
 * First reads env vars (like getConfig()). If any of the configurable
 * keys (plexToken, plexUrl, realDebridApiKey) are empty, queries the
 * DB configs table — where the admin config page stores values — and
 * fills in missing fields.
 *
 * Also checks for Arr instance API keys and URLs stored in the DB
 * (configured via the web admin config page).
 *
 * This lets standalone scripts pick up values configured via the web
 * UI without needing a .env file.
 */
export async function resolveConfig(): Promise<AppConfig> {
  const env = envSchema.parse(process.env);
  const cfg = new AppConfig(env);

  // Always query DB to merge values (local SQLite PK lookup, <2ms)
  try {
    const { db } = await import("@/lib/db");
    const row = await db.config.findUnique({ where: { id: 1 } });
    if (row?.configJson) {
      const values = JSON.parse(row.configJson) as Record<string, string>;
      const overrides: Partial<Record<keyof EnvConfig, string>> = {};

      // Existing Plex/RD keys
      for (const [dbKey, envKey] of Object.entries(DB_ENV_KEY_MAP)) {
        const envVal = env[envKey] as string | undefined;
        const dbVal = values[dbKey];
        if ((!envVal || envVal.length === 0) && dbVal && dbVal.length > 0) {
          overrides[envKey as keyof EnvConfig] = dbVal;
        }
      }

      // Arr instance API keys + URLs from DB
      // Precedence: env > DB > default (fixes URL precedence bug:
      // previously DB overrode env unconditionally for URLs)
      for (const def of ARR_INSTANCE_DEFINITIONS) {
        const apiKeyEnvKey = `ARR__${def.name.toUpperCase()}__API_KEY` as keyof EnvConfig;
        const urlEnvKey = `ARR__${def.name.toUpperCase()}__URL` as keyof EnvConfig;

        // API key: env > DB > default (default is "")
        const envApiKey = env[apiKeyEnvKey] as string | undefined;
        const dbApiKey = values[arrConfigDbKey(def.slug, "api_key")];
        if ((!envApiKey || envApiKey.length === 0) && dbApiKey && dbApiKey.length > 0) {
          overrides[apiKeyEnvKey] = dbApiKey;
        }

        // URL: env > DB > default (default is from canonical definitions)
        const envUrl = env[urlEnvKey] as string | undefined;
        const dbUrl = values[arrConfigDbKey(def.slug, "url")];
        if ((!envUrl || envUrl.length === 0) && dbUrl && dbUrl.length > 0) {
          overrides[urlEnvKey] = dbUrl;
        }
      }

      if (Object.keys(overrides).length > 0) {
        return new AppConfig({ ...env, ...overrides } as EnvConfig);
      }
    }
  } catch {
    // DB not available (no Prisma, no migration, etc.) — degrade gracefully
  }

  return cfg;
}
