/**
 * Decypharr API client — submits magnets/torrents to Decypharr and
 * lists/deletes finished torrents. Mirrors ~/ServerTool/pkg/decypharr/client.go
 * and the /api/torrents usage in ~/ServerTool/cmd/magnet_bridge/main.go.
 */

export interface DecypharrTorrent {
  id: string;
  category: string;
  name: string;
  state: string;
  info_hash: string;
  content_path: string;
}

export interface DecypharrTorrentsResponse {
  categories: string[];
  has_next: boolean;
  has_prev: boolean;
  limit: number;
  page: number;
  torrents: DecypharrTorrent[];
}

export class DecypharrClient {
  private baseUrl: string;
  private arrName: string;
  private downloadFolder: string;

  constructor(baseUrl = "http://192.168.1.99:8282", arrName = "special", downloadFolder = "/mnt/debrid/downloads") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.arrName = arrName;
    this.downloadFolder = downloadFolder;
  }

  /**
   * Parse the Decypharr /api/add response and throw if any result has
   * status "error" — Decypharr returns HTTP 200 even for failures, so the
   * caller's `if (!res.ok)` check alone won't catch it.
   */
  private async _checkAddResponse(res: Response): Promise<void> {
    if (!res.ok) {
      throw new Error(`Decypharr returned ${res.status}: ${await res.text()}`);
    }
    // Decypharr returns 200 with an error body on failure — check for it.
    const body: unknown = await res.json();
    if (Array.isArray(body)) {
      const errors = body.filter((r: any) => r?.status === "error");
      if (errors.length > 0) {
        const msgs = errors.map((r: any) => r.error ?? "unknown error").join("; ");
        throw new Error(`Decypharr rejected submission: ${msgs}`);
      }
    }
  }

  /**
   * Submit a magnet link to Decypharr.
   */
  async addMagnet(magnet: string): Promise<void> {
    const form = new FormData();
    form.append("urls", magnet);
    form.append("arr", this.arrName);
    form.append("downloadFolder", this.downloadFolder);
    form.append("action", "symlink");
    form.append("downloadUncached", "false");
    form.append("rmTrackerUrls", "false");

    const res = await fetch(`${this.baseUrl}/api/add`, {
      method: "POST",
      body: form,
    });

    await this._checkAddResponse(res);
  }

  /**
   * List all torrents currently tracked by Decypharr.
   * Used by the magnet-bridge worker to find finished `special` torrents.
   */
  async listTorrents(): Promise<DecypharrTorrentsResponse> {
    const res = await fetch(`${this.baseUrl}/api/torrents`);
    if (!res.ok) {
      throw new Error(`Decypharr returned ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as DecypharrTorrentsResponse;
  }

  /**
   * Delete a torrent from the Decypharr UI by category + info hash.
   * The Go magnet_bridge DELETEs `/api/torrents/special/<infohash>` once the
   * content has been moved into the media library.
   */
  async deleteTorrent(category: string, infoHash: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/torrents/${encodeURIComponent(category)}/${encodeURIComponent(infoHash)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      throw new Error(`Decypharr returned ${res.status}: ${await res.text()}`);
    }
  }

  /**
   * Submit a torrent file to Decypharr.
   */
  async addTorrent(torrentData: ArrayBuffer, filename: string): Promise<void> {
    const form = new FormData();
    form.append("files", new Blob([torrentData]), filename);
    form.append("arr", this.arrName);
    form.append("downloadFolder", this.downloadFolder);
    form.append("action", "symlink");
    form.append("downloadUncached", "false");
    form.append("rmTrackerUrls", "false");

    const res = await fetch(`${this.baseUrl}/api/add`, {
      method: "POST",
      body: form,
    });

    await this._checkAddResponse(res);
  }
}
