/**
 * Decypharr API client — submits magnets/torrents to Decypharr.
 * Mirrors ~/ServerTool/pkg/decypharr/client.go
 */

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

    if (!res.ok) {
      throw new Error(`Decypharr returned ${res.status}: ${await res.text()}`);
    }
  }
}
