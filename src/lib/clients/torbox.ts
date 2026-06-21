/**
 * Torbox API client — checks whether torrents are cached on the debrid service.
 * Mirrors ~/ServerTool/pkg/torbox/client.go
 */

export class TorboxClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Batch check which hashes are cached.
   * Returns a map of hash → boolean (cached or not).
   */
  async checkCached(hashes: string[]): Promise<Map<string, boolean>> {
    const res = await fetch("https://api.torbox.app/v1/api/torrents/checkcached", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hashes }),
    });

    if (!res.ok) {
      throw new Error(`Torbox API returned ${res.status}: ${await res.text()}`);
    }

    const body = await res.json() as {
      success: boolean;
      error?: string | null;
      detail?: string;
      data: Record<string, { name: string; size: number; hash: string }>;
    };

    if (!body.success) {
      throw new Error(`Torbox API error: ${body.detail ?? body.error ?? "unknown"}`);
    }

    const cached = new Map<string, boolean>();
    for (const hash of hashes) {
      cached.set(hash, hash.toLowerCase() in body.data);
    }

    return cached;
  }

  /**
   * Extract the info_hash from a magnet URI.
   * Supports: magnet:?xt=urn:btih:HASH&...
   */
  static extractHashFromMagnet(magnet: string): string {
    const idx = magnet.indexOf("urn:btih:");
    if (idx === -1) return "";
    const hashPart = magnet.slice(idx + 9);
    const end = hashPart.search(/[&?]/);
    const hash = end !== -1 ? hashPart.slice(0, end) : hashPart;
    return hash.trim().toLowerCase();
  }
}
