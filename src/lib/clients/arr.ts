/**
 * Generic Sonarr/Radarr v3 API client.
 * Mirrors ~/ServerTool/cmd/web/handler/arr_client.go
 */

import type { ArrInstance } from "@/types";

export class ArrClient {
  private instance: ArrInstance;
  private baseUrl: string;

  constructor(instance: ArrInstance) {
    this.instance = instance;
    this.baseUrl = instance.url.replace(/\/+$/, "");
  }

  private get headers() {
    return { "X-Api-Key": this.instance.apiKey };
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v3${path}`, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
    });
    if (!res.ok) {
      throw new Error(`Arr API error (${res.status}): ${await res.text()}`);
    }
    return res.json();
  }

  // ── Movies (Radarr) ────────────────────────────────────────────────────

  async listMovies(): Promise<ArrMovieResponse[]> {
    return this.fetch("/movie");
  }

  // ── Series (Sonarr) ────────────────────────────────────────────────────

  async listSeries(): Promise<ArrSeriesResponse[]> {
    return this.fetch("/series");
  }

  async lookupSeries(term: string): Promise<ArrSeriesResponse[]> {
    return this.fetch(`/series/lookup?term=${encodeURIComponent(term)}`);
  }

  // ── Wanted / Missing (Sonarr) ──────────────────────────────────────────

  async getWantedMissing(page = 1, pageSize = 50): Promise<{ records: ArrEpisodeResponse[]; totalRecords: number }> {
    return this.fetch(`/wanted/missing?page=${page}&pageSize=${pageSize}&sortKey=airDateUtc&sortDir=desc`);
  }

  // ── Quality Profiles & Root Folders ─────────────────────────────────────

  async listQualityProfiles(): Promise<QualityProfileResponse[]> {
    return this.fetch("/qualityprofile");
  }

  async listRootFolders(): Promise<RootFolderResponse[]> {
    return this.fetch("/rootfolder");
  }

  // ── Movie lookup (Radarr) ───────────────────────────────────────────────

  async lookupMovie(term: string): Promise<MovieLookupResponse[]> {
    return this.fetch(`/movie/lookup?term=${encodeURIComponent(term)}`);
  }

  // ── Commands ───────────────────────────────────────────────────────────

  async triggerMovieSearch(movieIds: number[]) {
    return this.fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "MoviesSearch", movieIds }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async triggerEpisodeSearch(episodeIds: number[]) {
    return this.fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "EpisodeSearch", episodeIds }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async triggerSeasonSearch(seriesId: number, seasonNumber: number) {
    return this.fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "SeasonSearch", seriesId, seasonNumber }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async triggerSeriesSearch(seriesId: number) {
    return this.fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "SeriesSearch", seriesId }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async triggerRescan(path: string) {
    return this.fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "RescanMovie", path }),
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  async deleteMovie(id: number, deleteFiles = false) {
    return this.fetch(`/movie/${id}?deleteFiles=${deleteFiles}`, { method: "DELETE" });
  }

  async deleteSeries(id: number, deleteFiles = false) {
    return this.fetch(`/series/${id}?deleteFiles=${deleteFiles}`, { method: "DELETE" });
  }

  // ── Add series (used by plex-to-arr) ─────────────────────────────────

  async addSeries(data: {
    tvdbId: number;
    title: string;
    qualityProfileId: number;
    languageProfileId?: number;
    rootFolderPath: string;
    seriesType: string;
    seasonFolder?: boolean;
    monitored: boolean;
    images?: { coverType: string; remoteUrl: string }[];
    seasons?: { seasonNumber: number; monitored: boolean }[];
    addOptions?: { searchForMissingEpisodes?: boolean; monitor?: string };
  }) {
    return this.fetch("/series", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    });
  }

  async addMovie(data: {
    tmdbId: number;
    title: string;
    qualityProfileId: number;
    rootFolderPath: string;
    monitored: boolean;
    minimumAvailability?: string;
    images?: { coverType: string; remoteUrl: string }[];
    addOptions?: { searchForMovie?: boolean; searchForMissingEpisodes?: boolean };
  }) {
    return this.fetch("/movie", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ── Response types ────────────────────────────────────────────────────────

interface ArrMovieResponse {
  id: number;
  title: string;
  titleSlug: string;
  path: string;
  hasFile: boolean;
  monitored: boolean;
  status: string;
  tmdbId?: number;
  folderName?: string;
}

interface ArrSeriesResponse {
  id: number;
  title: string;
  titleSlug: string;
  path: string;
  tvdbId?: number;
  seriesType?: string;
  seasonFolder?: boolean;
  monitored?: boolean;
  genres?: string[];
  seasons?: { seasonNumber: number; monitored: boolean }[];
  images?: { coverType: string; remoteUrl: string }[];
}

interface ArrEpisodeResponse {
  id: number;
  seriesId: number;
  episodeNumber: number;
  seasonNumber: number;
  airDateUtc?: string;
  hasFile?: boolean;
}

export interface QualityProfileResponse {
  id: number;
  name: string;
  upgradeAllowed: boolean;
  cutoff: number;
  items: { quality?: { id: number; name: string }; name: string; allowed: boolean }[];
  formatItems?: unknown[];
}

export interface RootFolderResponse {
  id: number;
  path: string;
  accessible: boolean;
  freeSpace: number;
  unmappedFolders?: { name: string; path: string }[];
}

export interface MovieLookupResponse {
  id: number;
  title: string;
  tmdbId: number;
  titleSlug: string;
  genres?: string[];
  images?: { coverType: string; remoteUrl: string }[];
  monitored?: boolean;
  minimumAvailability?: string;
}

/**
 * Builds a folder-name → Arr web URL mapping for file-tree viewers.
 * Mirrors FetchArrMappings() in arr_client.go.
 */
export async function buildArrMappings(instances: ArrInstance[]): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};

  for (const inst of instances) {
    const client = new ArrClient(inst);
    try {
      if (inst.type === "radarr") {
        const movies = await client.listMovies();
        for (const m of movies) {
          const folderName = m.titleSlug || m.title;
          if (folderName) {
            mapping[folderName] = `${inst.url}/movie/${m.titleSlug}`;
          }
        }
      } else {
        const series = await client.listSeries();
        for (const s of series) {
          const folderName = s.titleSlug || s.title;
          if (folderName) {
            mapping[folderName] = `${inst.url}/series/${s.titleSlug}`;
          }
        }
      }
    } catch (err) {
      console.warn(`[ArrClient] Failed to fetch ${inst.name} mappings:`, err);
    }
  }

  return mapping;
}
