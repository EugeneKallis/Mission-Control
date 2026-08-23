import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, userEvent } from "@/test-utils/render";
import { OperationsPage } from "./operations-page";
import type { OperationsSnapshot } from "@/lib/operations";

const originalFetch = globalThis.fetch;

function snapshot(overrides: Partial<OperationsSnapshot> = {}): OperationsSnapshot {
  return {
    config: {
      backupDir: "/var/lib/mission-control/backups",
      backupRetention: 14,
      githubRepos: ["n8n-io/n8n"],
      adguardUrl: "http://adguard.test",
      adguardUsername: "admin",
      tlsTargets: [{ name: "Plex", host: "plex.test", port: 443 }],
      hasAdguardPassword: true,
    },
    backup: { name: "mission-control.db", createdAt: "2026-08-23T10:00:00Z", size: 1024, integrity: "ok", foreignKeyErrors: 0 },
    deployments: [{ timestamp: "2026-08-23T10:00:00Z", status: "success", sha: "abcdef123456", subject: "Ship operations", stage: "complete" }],
    releases: [{ repo: "n8n-io/n8n", tag: "v2", url: "https://github.com/n8n-io/n8n/releases/v2", publishedAt: "2026-08-22T10:00:00Z", acknowledged: false }],
    adguard: { configured: true, ok: true, protectionEnabled: true, dnsQueries: 100, blockedPercent: 25, averageProcessingMs: 2 },
    tls: [{ name: "Plex", host: "plex.test", port: 443, ok: true, authorized: true, daysRemaining: 60, expiresAt: "2026-10-22T10:00:00Z" }],
    maintenance: [],
    activeSuppressedSources: [],
    restoreVerifiedAt: null,
    checkedAt: "2026-08-23T10:00:00Z",
    alertCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.fetch = mock(async () => Response.json(snapshot())) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OperationsPage", () => {
  test("renders all six operation areas", async () => {
    render(<OperationsPage />);
    for (const title of ["Disaster recovery", "Deployment ledger", "Release radar", "AdGuard DNS", "TLS certificates", "Maintenance windows"]) {
      expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("Ship operations")).toBeInTheDocument();
    expect(screen.getByText("Protection enabled")).toBeInTheDocument();
  });

  test("never renders the stored AdGuard password", async () => {
    render(<OperationsPage />);
    const password = await screen.findByLabelText("AdGuard password") as HTMLInputElement;
    expect(password.value).toBe("");
    expect(password.placeholder).toContain("Stored");
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  test("acknowledges a release through the action API", async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    globalThis.fetch = mock(async (input, init) => {
      calls.push({ url: String(input), body: init?.body?.toString() });
      return Response.json(snapshot());
    }) as unknown as typeof fetch;
    render(<OperationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
    expect(calls.some((call) => call.body?.includes('"action":"ack-release"'))).toBeTrue();
  });
});
