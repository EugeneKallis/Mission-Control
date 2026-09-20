export interface ZurgTorrent {
  hash: string;
  name: string;
  category: string;
  state: string;
  content_path: string;
}

export class ZurgClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly category: string;

  constructor(baseUrl = "http://192.168.1.99:9999", apiKey = "", category = "special") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.category = category;
  }

  private headers(extra?: HeadersInit): Headers {
    if (!this.apiKey) throw new Error("Zurg API key is not configured");
    const headers = new Headers(extra);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    return headers;
  }

  private async checkAddResponse(response: Response): Promise<void> {
    const text = await response.text();
    if (!response.ok) throw new Error(`Zurg returned ${response.status}: ${text}`);
    if (text.trim() === "Fails.") throw new Error("Zurg rejected submission");
  }

  async addMagnet(magnet: string): Promise<void> {
    const form = new URLSearchParams({ urls: magnet, category: this.category });
    await this.checkAddResponse(await fetch(`${this.baseUrl}/api/v2/torrents/add`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: form,
    }));
  }

  async addTorrent(data: ArrayBuffer, filename: string): Promise<void> {
    const form = new FormData();
    form.append("torrents", new Blob([data]), filename);
    form.append("category", this.category);
    await this.checkAddResponse(await fetch(`${this.baseUrl}/api/v2/torrents/add`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    }));
  }

  async listTorrents(): Promise<ZurgTorrent[]> {
    const response = await fetch(`${this.baseUrl}/api/v2/torrents/info?category=${encodeURIComponent(this.category)}`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`Zurg returned ${response.status}: ${await response.text()}`);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("Zurg returned an invalid torrent list");
    return body.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Zurg returned an invalid torrent list");
      const torrent = item as Record<string, unknown>;
      const fields = ["hash", "name", "category", "state", "content_path"] as const;
      if (fields.some((field) => typeof torrent[field] !== "string")) {
        throw new Error("Zurg returned an invalid torrent list");
      }
      return {
        hash: torrent.hash as string,
        name: torrent.name as string,
        category: torrent.category as string,
        state: torrent.state as string,
        content_path: torrent.content_path as string,
      };
    });
  }

  async removeTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await fetch(`${this.baseUrl}/api/v2/torrents/delete`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      body,
    });
    if (!response.ok) throw new Error(`Zurg returned ${response.status}: ${await response.text()}`);
  }
}
