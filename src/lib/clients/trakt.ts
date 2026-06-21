/**
 * Trakt API client — watched shows export, device-code auth.
 * Mirrors ~/ServerTool/cmd/trakt_exporter/.
 * Full implementation when Trakt workers are built (Part 18).
 */

export class TraktClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl = "https://api.trakt.tv";

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": this.clientId,
        ...init?.headers,
      },
    });
    if (!res.ok) throw new Error(`Trakt API error (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async getWatchedShows(accessToken: string): Promise<WatchedShow[]> {
    return this.fetch("/sync/watched/shows", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  /**
   * Initiate device code flow.
   */
  async deviceCode(): Promise<{ device_code: string; user_code: string; verification_url: string; expires_in: number; interval: number }> {
    const res = await fetch("https://api.trakt.tv/oauth/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.clientId }),
    });
    return res.json();
  }

  async pollDeviceToken(deviceCode: string): Promise<{ access_token: string; refresh_token: string; created_at: number }> {
    const res = await fetch("https://api.trakt.tv/oauth/device/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: deviceCode,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if ((data as { error?: string }).error === "authorization_pending") {
        throw new Error("PENDING");
      }
      throw new Error(`Trakt token poll error: ${JSON.stringify(data)}`);
    }
    return data as { access_token: string; refresh_token: string; created_at: number };
  }
}

export interface WatchedShow {
  plays: number;
  last_watched_at: string;
  show: {
    title: string;
    year: number;
    ids: { trakt: number; tvdb?: number; tvrage?: number };
  };
  seasons?: { number: number; episodes: { number: number; plays: number }[] }[];
}
