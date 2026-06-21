/**
 * Plex API client — OAuth PIN flow, hubs, watchlist.
 * Mirrors ~/ServerTool/cmd/*plex* agents.
 * Full implementation when Plex workers are built (Part 18).
 */

import type { PlexConfig } from "@/types";

export class PlexClient {
  private config: PlexConfig;

  constructor(config: PlexConfig) {
    this.config = config;
  }

  private get headers() {
    return {
      "X-Plex-Token": this.config.token,
      Accept: "application/json",
    };
  }

  private async fetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { ...this.headers, ...init?.headers } });
    if (!res.ok) throw new Error(`Plex API error (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async getContinueWatching(): Promise<MediaContainer> {
    return this.fetch(`${this.config.url}/hubs/continueWatching/`);
  }

  async getWatchlist(): Promise<MediaContainer> {
    return this.fetch(this.config.watchlistRss ?? `${this.config.url}/library/sections/watchlist/`);
  }

  async getLibraries(): Promise<MediaContainer> {
    return this.fetch(`${this.config.url}/library/sections`);
  }

  async getLibraryItems(sectionId: number): Promise<MediaContainer> {
    return this.fetch(`${this.config.url}/library/sections/${sectionId}/all`);
  }

  /**
   * Plex OAuth PIN flow — creates a pin and returns the poll URL.
   */
  static async createPin(): Promise<PinResponse> {
    const res = await fetch("https://plex.tv/api/v2/pins?strong=true", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    return res.json();
  }

  static async pollPin(pinId: string): Promise<PinResponse> {
    const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: { Accept: "application/json" },
    });
    return res.json();
  }
}

export interface MediaContainer {
  MediaContainer: {
    size: number;
    totalSize?: number;
    Metadata?: MetadataItem[];
    Directory?: { key: string; title: string; type: string }[];
  };
}

export interface MetadataItem {
  ratingKey: string;
  key: string;
  guid: string;
  slug?: string;
  title: string;
  type: string;
  year?: number;
  viewCount?: number;
  lastViewedAt?: number;
  addedAt?: number;
  updatedAt?: number;
  UserRating?: number;
  // For episodes
  parentIndex?: number;
  index?: number;
  parentTitle?: string;
  grandparentTitle?: string;
}

export interface PinResponse {
  id: string;
  code: string;
  product: string;
  trusted: boolean;
  qr: string;
  clientIdentifier: string;
  expiresIn: number;
  authToken?: string;
  createdAt: string;
}
