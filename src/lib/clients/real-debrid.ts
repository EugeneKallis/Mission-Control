/**
 * Real-Debrid API client.
 * Mirrors ~/ServerTool/pkg/realdebrid/client.go
 * API docs: ~/ServerTool/context/resources/api-real-debrid-com.md
 */

export class RealDebridClient {
  private apiKey: string;
  private baseUrl = "https://api.real-debrid.com/rest/1.0";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Real-Debrid API error (${res.status}): ${text}`) as Error & { status: number; body: string };
      err.status = res.status;
      err.body = text;
      throw err;
    }

    return res.json();
  }

  /**
   * Fetch authenticated user info.
   */
  async getUser(): Promise<UserResponse> {
    return this.fetch("/user");
  }

  /**
   * Get premium days remaining (seconds / 86400).
   */
  premiumDaysRemaining(user: UserResponse): number {
    return Math.floor(user.premium / 86400);
  }

  // ── Torrent API methods (used by realdebrid_migrate) ─────────────────

  async getTorrents(limit = 5000, offset = 0): Promise<TorrentInfo[]> {
    return this.fetch(`/torrents?limit=${limit}&offset=${offset}`);
  }

  async getTorrentInfo(id: string): Promise<TorrentInfo> {
    return this.fetch(`/torrents/info/${id}`);
  }

  async getTorrentInstantAvailability(
    hashes: string[]
  ): Promise<Record<string, Record<string, unknown>>> {
    const params = new URLSearchParams();
    for (const h of hashes) params.append("hash", h);
    return this.fetch(`/torrents/instantAvailability?${params}`);
  }

  async addTorrentMagnet(magnet: string): Promise<{ id: string; uri: string }> {
    const body = new URLSearchParams({ magnet });
    return this.fetch("/torrents/addMagnet", {
      method: "POST",
      body: body.toString(),
    });
  }

  async addTorrentFile(file: Blob, filename: string): Promise<{ id: string; uri: string }> {
    const form = new FormData();
    form.append("file", file, filename);
    const res = await fetch(`${this.baseUrl}/torrents/addTorrent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Real-Debrid addTorrent error (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async selectTorrentFiles(
    id: string,
    files: string[]
  ): Promise<void> {
    const body = new URLSearchParams();
    for (const f of files) body.append("files", f);
    await this.fetch(`/torrents/selectFiles/${id}`, {
      method: "POST",
      body: body.toString(),
    });
  }

  async deleteTorrent(id: string): Promise<void> {
    await this.fetch(`/torrents/delete/${id}`, { method: "DELETE" });
  }

  // ── Unrestrict / Downloads ───────────────────────────────────────────

  async unrestrictLink(link: string): Promise<{ download: string }> {
    const body = new URLSearchParams({ link });
    return this.fetch("/unrestrict/link", {
      method: "POST",
      body: body.toString(),
    });
  }

  async getDownloads(limit = 5000, offset = 0): Promise<DownloadInfo[]> {
    return this.fetch(`/downloads?limit=${limit}&offset=${offset}`);
  }
}

// ── Response types ────────────────────────────────────────────────────────

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  points: number;
  locale: string;
  avatar: string;
  type: string;
  premium: number;
  expiration: string;
}

export interface TorrentInfo {
  id: string;
  filename: string;
  hash: string;
  bytes: number;
  host: string;
  split: number;
  progress: number;
  status: string;
  added: string;
  files: Array<{ id: number; path: string; bytes: number; selected: number }>;
  links: string[];
}

export interface DownloadInfo {
  id: string;
  filename: string;
  mimeType: string;
  filesize: number;
  link: string;
  host: string;
  hostDomain: string;
  chunk: number;
  status: string;
  generated: string;
  download: string;
}

/**
 * Check if an error is an auth error.
 */
export function isAuthError(err: unknown): boolean {
  const e = err as { status?: number; body?: string };
  if (e.status === 401 || e.status === 403) return true;
  if (e.status === 400 && e.body?.includes("bad token")) return true;
  return false;
}
