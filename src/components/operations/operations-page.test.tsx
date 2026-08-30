import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ToastProvider } from "@/components/toast-provider";
import { render, screen, userEvent } from "@/test-utils/render";
import { OperationsPage } from "./operations-page";
import type { OperationsSnapshot, ReleaseStatus } from "@/lib/operations";

const originalFetch = globalThis.fetch;
const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

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
function mixedReleases(): ReleaseStatus[] {
  return [
    { repo: "n8n-io/n8n", tag: "v2", url: "https://github.com/n8n-io/n8n/releases/v2", publishedAt: "2026-08-22T10:00:00Z", acknowledged: false },
    { repo: "gethomepage/homepage", tag: "v1.4.0", url: "https://github.com/gethomepage/homepage/releases/v1.4.0", publishedAt: "2026-08-21T10:00:00Z", acknowledged: true },
    { repo: "broken/repo", tag: "v3", url: "https://github.com/broken/repo/releases/v3", publishedAt: "2026-08-20T10:00:00Z", acknowledged: false, error: "GitHub returned 500" },
    { repo: "unknown/repo", tag: "unknown", url: "https://github.com/unknown/repo/releases", publishedAt: "", acknowledged: false },
  ];
}

function mixedSnapshot(overrides: Partial<OperationsSnapshot> = {}): OperationsSnapshot {
  return snapshot({ releases: mixedReleases(), ...overrides });
}

beforeEach(() => {
  globalThis.fetch = mock(async () => Response.json(snapshot())) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
  Object.defineProperty(document, "execCommand", { configurable: true, value: originalExecCommand });
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
  test("copies known release prompt in display order", async () => {
    const writeText = mock(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    globalThis.fetch = mock(async () => Response.json(mixedSnapshot())) as unknown as typeof fetch;
    render(<ToastProvider><OperationsPage /></ToastProvider>);

    await userEvent.click(await screen.findByRole("button", { name: "Copy agent prompt" }));

    expect(writeText).toHaveBeenCalledWith([
      "Update the LXCs associated with these GitHub releases, then verify each service is healthy:",
      "- n8n-io/n8n (v2)",
      "- gethomepage/homepage (v1.4.0)",
    ].join("\n"));
    expect(await screen.findByText("Release update prompt copied", { exact: true })).toBeInTheDocument();
  });
  test("copies the prompt when the browser lacks the Clipboard API", async () => {
    const execCommand = mock(() => true);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    globalThis.fetch = mock(async () => Response.json(mixedSnapshot())) as unknown as typeof fetch;
    render(<ToastProvider><OperationsPage /></ToastProvider>);

    await userEvent.click(await screen.findByRole("button", { name: "Copy agent prompt" }));

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(await screen.findByText("Release update prompt copied", { exact: true })).toBeInTheDocument();
  });

  test("shows an error when the release prompt cannot be copied", async () => {
    const writeText = mock(async () => { throw new Error("Clipboard unavailable"); });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    globalThis.fetch = mock(async () => Response.json(mixedSnapshot())) as unknown as typeof fetch;
    render(<ToastProvider><OperationsPage /></ToastProvider>);

    await userEvent.click(await screen.findByRole("button", { name: "Copy agent prompt" }));

    expect(await screen.findByText("Could not copy release update prompt", { exact: true })).toBeInTheDocument();
  });

  test("acknowledges all pending releases and disables the bulk action", async () => {
    const initial = mixedSnapshot();
    const acknowledged = mixedSnapshot({
      releases: mixedReleases().map((release) => release.error || release.tag === "unknown" ? release : { ...release, acknowledged: true }),
      alertCount: 0,
    });
    const calls: Array<{ method?: string; body?: string }> = [];
    globalThis.fetch = mock(async (_input, init) => {
      calls.push({ method: init?.method, body: init?.body?.toString() });
      return Response.json(init?.method === "POST" ? acknowledged : initial);
    }) as unknown as typeof fetch;
    render(<ToastProvider><OperationsPage /></ToastProvider>);

    const button = await screen.findByRole("button", { name: "Acknowledge all" });
    expect(button).not.toBeDisabled();
    await userEvent.click(button);

    expect(calls.some((call) => call.method === "POST" && call.body === JSON.stringify({ action: "ack-all-releases" }))).toBeTrue();
    expect(await screen.findAllByText("Seen")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Acknowledge all" })).toBeDisabled();
    expect(screen.getByText("GitHub returned 500")).toBeInTheDocument();
    expect(screen.getByText(/unknown ·/)).toBeInTheDocument();
  });

  test("disables copying when no known releases are available", async () => {
    globalThis.fetch = mock(async () => Response.json(snapshot({
      releases: [
        { repo: "broken/repo", tag: "v3", url: "https://github.com/broken/repo/releases/v3", publishedAt: "", acknowledged: false, error: "GitHub returned 500" },
        { repo: "unknown/repo", tag: "unknown", url: "https://github.com/unknown/repo/releases", publishedAt: "", acknowledged: false },
      ],
      alertCount: 0,
    }))) as unknown as typeof fetch;
    render(<OperationsPage />);

    expect(await screen.findByRole("button", { name: "Copy agent prompt" })).toBeDisabled();
  });
});
