/**
 * Runtime configuration loader.
 * Loads and validates config from env vars with sensible defaults.
 * Mirrors ~/ServerTool/config/config.go
 */

import { z } from "zod";
import type { ArrInstance } from "@/types";

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
});

export type EnvConfig = z.infer<typeof envSchema>;

// ── Default Arr instances ─────────────────────────────────────────────────

const DEFAULT_ARR_INSTANCES: ArrInstance[] = [
  { type: "radarr", name: "Radarr", url: "http://192.168.1.111:7878", apiKey: "" },
  { type: "radarr", name: "Radarr4K", url: "http://192.168.1.111:7879", apiKey: "" },
  { type: "radarr", name: "RadarrKids", url: "http://192.168.1.111:7880", apiKey: "" },
  { type: "radarr", name: "RadarrAnime", url: "http://192.168.1.111:7881", apiKey: "" },
  { type: "radarr", name: "RadarrLocal", url: "http://192.168.1.111:7882", apiKey: "" },
  { type: "sonarr", name: "Sonarr", url: "http://192.168.1.111:8989", apiKey: "" },
  { type: "sonarr", name: "Sonarr4K", url: "http://192.168.1.111:8990", apiKey: "" },
  { type: "sonarr", name: "SonarrKids", url: "http://192.168.1.111:8991", apiKey: "" },
  { type: "sonarr", name: "SonarrAnime", url: "http://192.168.1.111:8992", apiKey: "" },
  { type: "sonarr", name: "SonarrLocal", url: "http://192.168.1.111:8993", apiKey: "" },
];

// ── Resolve ───────────────────────────────────────────────────────────────

function resolveArrInstances(env: EnvConfig): ArrInstance[] {
  return DEFAULT_ARR_INSTANCES.map((inst) => {
    const envKey = `ARR__${inst.name.toUpperCase()}__API_KEY` as keyof EnvConfig;
    const envOverride = env[envKey] as string | undefined;
    if (envOverride && envOverride.length > 0) {
      return { ...inst, apiKey: envOverride };
    }
    return inst;
  });
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

// ── Singleton ─────────────────────────────────────────────────────────────

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;
  const env = envSchema.parse(process.env);
  _config = new AppConfig(env);
  return _config;
}
