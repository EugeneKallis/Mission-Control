import { describe, expect, test } from "bun:test";
import {
  activeMaintenance,
  countOperationsAlerts,
  databasePath,
  defaultOperationsConfig,
  normalizeOperationsConfig,
  normalizeRepo,
  normalizeTlsTarget,
  parseDeploymentLog,
  sourceSuppressed,
  tlsSeverity,
  validateBackupDirectory,
  type MaintenanceWindow,
  type OperationsSnapshot,
  type TlsStatus,
} from "./operations";

const NOW = Date.parse("2026-08-23T12:00:00.000Z");

function window(overrides: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id: "one",
    startsAt: "2026-08-23T11:00:00.000Z",
    endsAt: "2026-08-23T13:00:00.000Z",
    reason: "Upgrade",
    sources: ["backup"],
    ...overrides,
  };
}

function alertInput(): Pick<OperationsSnapshot, "backup" | "deployments" | "releases" | "adguard" | "tls" | "maintenance"> {
  return {
    backup: { name: "good.db", createdAt: "2026-08-23T10:00:00.000Z", size: 1, integrity: "ok", foreignKeyErrors: 0 },
    deployments: [{ timestamp: "2026-08-23T10:00:00.000Z", status: "success", sha: "abc", subject: "ok", stage: "complete" }],
    releases: [],
    adguard: { configured: false, ok: false },
    tls: [],
    maintenance: [],
  };
}

describe("operations config", () => {
  test("normalizes GitHub repo URLs and rejects invalid names", () => {
    expect(normalizeRepo("https://github.com/n8n-io/n8n/")).toBe("n8n-io/n8n");
    expect(normalizeRepo("not a repo")).toBeNull();
  });

  test("normalizes TLS targets and validates ports", () => {
    expect(normalizeTlsTarget({ name: "Plex", host: "plex.test", port: 443 })).toEqual({ name: "Plex", host: "plex.test", port: 443 });
    expect(normalizeTlsTarget({ name: "Plex", host: "plex.test", port: 70_000 })).toBeNull();
  });

  test("preserves a stored password when the form submits blank", () => {
    const current = { ...defaultOperationsConfig(), adguardPassword: "secret" };
    expect(normalizeOperationsConfig({ adguardPassword: "" }, current).adguardPassword).toBe("secret");
  });

  test("deduplicates repositories and clamps retention", () => {
    const value = normalizeOperationsConfig({ githubRepos: ["n8n-io/n8n", "n8n-io/n8n", "bad"], backupRetention: 500 });
    expect(value.githubRepos).toEqual(["n8n-io/n8n"]);
    expect(value.backupRetention).toBe(90);
  });

  test("rejects a backup directory inside the live database directory", () => {
    expect(() => validateBackupDirectory("/srv/app/prisma/backups", "/srv/app/prisma/dev.db")).toThrow("outside");
    expect(() => validateBackupDirectory("/srv/backups", "/srv/app/prisma/dev.db")).not.toThrow();
  });

  test("resolves file database URLs", () => {
    expect(databasePath("file:/tmp/example.db")).toBe("/tmp/example.db");
    expect(() => databasePath("libsql://example.test")).toThrow("local file");
  });
});

describe("deployment ledger", () => {
  test("parses valid records, ignores junk, and sorts newest first", () => {
    const text = [
      JSON.stringify({ timestamp: "2026-08-22T10:00:00Z", status: "success", sha: "a", subject: "A", stage: "complete" }),
      "not json",
      JSON.stringify({ timestamp: "2026-08-23T10:00:00Z", status: "failed", sha: "b", subject: "B", stage: "build" }),
      JSON.stringify({ timestamp: "2026-08-24T10:00:00Z", status: "invalid" }),
    ].join("\n");
    expect(parseDeploymentLog(text).map((item) => item.sha)).toEqual(["b", "a"]);
  });
});

describe("maintenance windows", () => {
  test("returns only currently active windows", () => {
    expect(activeMaintenance([window(), window({ id: "future", startsAt: "2026-08-24T11:00:00Z", endsAt: "2026-08-24T13:00:00Z" })], NOW).map((item) => item.id)).toEqual(["one"]);
  });

  test("suppresses only selected sources", () => {
    expect(sourceSuppressed([window()], "backup", NOW)).toBeTrue();
    expect(sourceSuppressed([window()], "tls", NOW)).toBeFalse();
  });
});

describe("operation alerts", () => {
  test("counts stale backups, failed deployments, releases, DNS, and TLS", () => {
    const input = alertInput();
    input.backup.createdAt = "2026-08-20T10:00:00Z";
    input.deployments[0].status = "failed";
    input.releases = [{ repo: "a/b", tag: "v1", url: "", publishedAt: "", acknowledged: false }];
    input.adguard = { configured: true, ok: true, protectionEnabled: false };
    input.tls = [{ name: "x", host: "x", port: 443, ok: true, authorized: true, daysRemaining: 10 }];
    expect(countOperationsAlerts(input, NOW)).toBe(5);
  });

  test("maintenance suppresses matching alerts without deleting evidence", () => {
    const input = alertInput();
    input.backup.integrity = "failed";
    input.maintenance = [window()];
    expect(countOperationsAlerts(input, NOW)).toBe(0);
    expect(input.backup.integrity).toBe("failed");
  });

  test("does not alert for configured-free AdGuard", () => {
    expect(countOperationsAlerts(alertInput(), NOW)).toBe(0);
  });
});

describe("TLS severity", () => {
  const target: TlsStatus = { name: "site", host: "site.test", port: 443, ok: true, authorized: true, daysRemaining: 31 };

  test("warns at 30 days and errors on validation failure", () => {
    expect(tlsSeverity(target)).toBe("ok");
    expect(tlsSeverity({ ...target, daysRemaining: 30 })).toBe("warning");
    expect(tlsSeverity({ ...target, authorized: false })).toBe("error");
  });
});
