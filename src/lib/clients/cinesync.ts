/**
 * CineSync client — skip processing for already-symlinked files.
 * Mirrors ~/ServerTool/cmd/cinesync_cleanup/.
 * Full implementation when CineSync workers are built (Part 18).
 */

export class CineSyncClient {
  private fileApiUrl: string;
  private authUrl: string;

  constructor(fileApiUrl = "http://192.168.1.102:5173", authUrl = "http://192.168.1.102:8082") {
    this.fileApiUrl = fileApiUrl;
    this.authUrl = authUrl;
  }

  async login(username = "admin", password = "admin"): Promise<string> {
    const res = await fetch(`${this.authUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(`CineSync auth error (${res.status})`);
    const data = await res.json() as { token?: string; access_token?: string };
    return data.token ?? data.access_token ?? "";
  }

  async getFiles(token: string): Promise<CineSyncFile[]> {
    const res = await fetch(`${this.fileApiUrl}/api/files`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`CineSync files error (${res.status})`);
    return res.json();
  }

  async skipProcessing(token: string, fileId: string): Promise<void> {
    const res = await fetch(`${this.authUrl}/api/processing/skip`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileId }),
    });
    if (!res.ok) throw new Error(`CineSync skip error (${res.status})`);
  }
}

export interface CineSyncFile {
  id: string;
  filename: string;
  SourcePath?: string;
  status?: string;
}
