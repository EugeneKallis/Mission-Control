import { describe, expect, test } from "bun:test";
import {
  countOperationsAlerts,
  defaultOperationsConfig,
  normalizeOperationsConfig,
  normalizeRepo,
  normalizeTlsTarget,
  parseDeploymentLog,
  tlsSeverity,
  type OperationsSnapshot,
  type TlsStatus,
} from "./operations";


function alertInput(): Pick<OperationsSnapshot, "deployments" | "releases" | "adguard" | "tls"> {
  return {
    deployments: [{ timestamp: "2026-08-23T10:00:00.000Z", status: "success", sha: "abc", subject: "ok", stage: "complete" }],
    releases: [],
    adguard: { configured: false, ok: false },
    tls: [],
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

  test("preserves omitted AdGuard fields during partial updates", () => {
    const current = { ...defaultOperationsConfig(), adguardUrl: "https://adguard.example.test", adguardUsername: "admin", adguardPassword: "secret" };
    const value = normalizeOperationsConfig({ githubRepos: ["n8n-io/n8n"] }, current);
    expect(value.adguardUrl).toBe("https://adguard.example.test");
    expect(value.adguardUsername).toBe("admin");
    expect(value.adguardPassword).toBe("secret");
  });

  test("clears explicit empty AdGuard fields but preserves a blank password", () => {
    const current = { ...defaultOperationsConfig(), adguardUrl: "https://adguard.example.test", adguardUsername: "admin", adguardPassword: "secret" };
    const value = normalizeOperationsConfig({ adguardUrl: "", adguardUsername: "", adguardPassword: "" }, current);
    expect(value.adguardUrl).toBe("");
    expect(value.adguardUsername).toBe("");
    expect(value.adguardPassword).toBe("secret");
  });

  test("deduplicates repositories", () => {
    expect(normalizeOperationsConfig({ githubRepos: ["n8n-io/n8n", "n8n-io/n8n", "bad"] }).githubRepos).toEqual(["n8n-io/n8n"]);
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


describe("operation alerts", () => {
  test("counts failed deployments, releases, DNS, and TLS", () => {
    const input = alertInput();
    input.deployments[0].status = "failed";
    input.releases = [{ repo: "a/b", tag: "v1", url: "", publishedAt: "", acknowledged: false }];
    input.adguard = { configured: true, ok: true, protectionEnabled: false };
    input.tls = [{ name: "x", host: "x", port: 443, ok: true, authorized: true, daysRemaining: 10 }];
    expect(countOperationsAlerts(input)).toBe(4);
  });

  test("does not alert for configured-free AdGuard", () => {
    expect(countOperationsAlerts(alertInput())).toBe(0);
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
