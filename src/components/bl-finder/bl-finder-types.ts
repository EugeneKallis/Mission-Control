/** Shared TS types for the BL Finder page. */

export interface BlFinderRow {
  id: number;
  filePath: string;
  lastChecked: string | null;
  brokenCount: number;
  isIgnored: boolean;
  errorMessage: string | null;
  status: string;
  checkCount: number;
  mediaDir: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface BlFinderConfig {
  enabled: boolean;
  intervalSec: number;
  batchSize: number;
  concurrency: number;
  timeoutSec: number;
  recheckAgeDays: number;
  discoverIntervalSec: number;
  mediaDirs: string[];
}

export interface BlFinderStatus {
  running: boolean;
  setAt: number;
  lastPassAt: number | null;
  processed: number;
  ok: number;
  broken: number;
  error: string | null;
}
