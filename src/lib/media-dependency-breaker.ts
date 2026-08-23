import { access, readFile } from "fs/promises";
import { resolveConfig } from "@/lib/config";
import { db } from "@/lib/db";

const INCIDENT_KEY = "media_dependency:incident";
const PROBE_TIMEOUT_MS = 5_000;
const NZBDAV_PATH = "/mnt/addons/nzbdav";

export interface MediaDependencyProbe {
  id: "unraid" | "nzbdav" | "nfs" | "rclone";
  name: string;
  ok: boolean;
  detail: string;
}

export interface MediaDependencyIncident {
  status: "open" | "resolved";
  startedAt: string;
  resolvedAt: string | null;
  lastCheckedAt: string;
  consecutiveSuccesses: number;
  failures: Pick<MediaDependencyProbe, "id" | "name" | "detail">[];
}

export interface MediaDependencyGuard {
  allowed: boolean;
  incident: MediaDependencyIncident | null;
}

function withTimeout<T>(promise: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function probeHttp(url: string): Promise<MediaDependencyProbe> {
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/api/torrents`, {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return {
      id: "unraid",
      name: "Unraid",
      ok: response.ok,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      id: "unraid",
      name: "Unraid",
      ok: false,
      detail: error instanceof Error && error.name === "TimeoutError" ? "Timed out" : "Unreachable",
    };
  }
}

function decodeMountPath(value: string): string {
  return value.replace(/\\040/g, " ").replace(/\\011/g, "\t").replace(/\\134/g, "\\");
}

export function findMountForPath(mountInfo: string, path: string): string | null {
  const normalized = path.replace(/\/+$/, "") || "/";
  let match: string | null = null;
  for (const line of mountInfo.split("\n")) {
    const fields = line.split(" ");
    if (fields.length < 5) continue;
    const mountPoint = decodeMountPath(fields[4]);
    if (normalized !== mountPoint && !normalized.startsWith(`${mountPoint.replace(/\/+$/, "")}/`)) continue;
    if (!match || mountPoint.length > match.length) match = mountPoint;
  }
  return match;
}

async function probeMount(
  id: MediaDependencyProbe["id"],
  name: string,
  path: string,
  mountInfo: string,
): Promise<MediaDependencyProbe> {
  const mountPoint = findMountForPath(mountInfo, path);
  if (!mountPoint || mountPoint === "/") return { id, name, ok: false, detail: "Mount unavailable" };
  try {
    await withTimeout(access(path));
    return { id, name, ok: true, detail: `Mounted at ${mountPoint}` };
  } catch (error) {
    return { id, name, ok: false, detail: error instanceof Error ? error.message : "Unavailable" };
  }
}

export async function probeMediaDependencies(): Promise<MediaDependencyProbe[]> {
  const config = await resolveConfig();
  const mountInfo = await readFile("/proc/self/mountinfo", "utf8").catch(() => "");
  return Promise.all([
    probeHttp(config.decypharrUrl),
    probeMount("nzbdav", "NZBDav", NZBDAV_PATH, mountInfo),
    probeMount("nfs", "NFS media", config.mediaBasePath, mountInfo),
    probeMount("rclone", "rclone", config.rclonePath, mountInfo),
  ]);
}

export async function checkMediaDependencies(
  probes?: MediaDependencyProbe[],
  now = new Date(),
): Promise<MediaDependencyGuard> {
  const results = probes ?? await probeMediaDependencies();
  const failures = results.filter((probe) => !probe.ok).map(({ id, name, detail }) => ({ id, name, detail }));
  const checkedAt = now.toISOString();

  return db.$transaction(async (tx) => {
    const stored = await tx.setting.findUnique({ where: { key: INCIDENT_KEY } });
    const previous = stored?.value ? JSON.parse(stored.value) as MediaDependencyIncident : null;

    if (failures.length > 0) {
      const incident: MediaDependencyIncident = {
        status: "open",
        startedAt: previous?.status === "open" ? previous.startedAt : checkedAt,
        resolvedAt: null,
        lastCheckedAt: checkedAt,
        consecutiveSuccesses: 0,
        failures,
      };
      await tx.setting.upsert({
        where: { key: INCIDENT_KEY },
        update: { value: JSON.stringify(incident) },
        create: { key: INCIDENT_KEY, value: JSON.stringify(incident) },
      });
      return { allowed: false, incident };
    }

    if (!previous || previous.status === "resolved") return { allowed: true, incident: previous };

    const consecutiveSuccesses = previous.consecutiveSuccesses + 1;
    const resolved = consecutiveSuccesses >= 2;
    const incident: MediaDependencyIncident = {
      ...previous,
      status: resolved ? "resolved" : "open",
      resolvedAt: resolved ? checkedAt : null,
      lastCheckedAt: checkedAt,
      consecutiveSuccesses,
      failures: resolved ? [] : previous.failures,
    };
    await tx.setting.update({ where: { key: INCIDENT_KEY }, data: { value: JSON.stringify(incident) } });
    return { allowed: resolved, incident };
  });
}

export async function getMediaDependencyIncident(): Promise<MediaDependencyIncident | null> {
  const stored = await db.setting.findUnique({ where: { key: INCIDENT_KEY } });
  return stored?.value ? JSON.parse(stored.value) as MediaDependencyIncident : null;
}
