import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ToastProvider } from "@/components/toast-provider";
import { fireEvent, render, screen, userEvent, waitFor } from "@/test-utils/render";
import { OperationsPage } from "./operations-page";
import type { OperationsSnapshot, ReleaseStatus } from "@/lib/operations";

const originalFetch = globalThis.fetch;
const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

function snapshot(overrides: Partial<OperationsSnapshot> = {}): OperationsSnapshot {
  return {
    config: {
      githubRepos: ["n8n-io/n8n"],
      adguardUrl: "http://adguard.test",
      adguardUsername: "admin",
      tlsTargets: [{ name: "Plex", host: "plex.test", port: 443 }],
      hasAdguardPassword: true,
    },
    deployments: [{ timestamp: "2026-08-23T10:00:00Z", status: "success", sha: "abcdef123456", subject: "Ship operations", stage: "complete" }],
    releases: [{ repo: "n8n-io/n8n", tag: "v2", url: "https://github.com/n8n-io/n8n/releases/v2", publishedAt: "2026-08-22T10:00:00Z", acknowledged: false }],
    adguard: { configured: true, ok: true, protectionEnabled: true, dnsQueries: 100, blockedPercent: 25, averageProcessingMs: 2 },
    tls: [{ name: "Plex", host: "plex.test", port: 443, ok: true, authorized: true, daysRemaining: 60, expiresAt: "2026-10-22T10:00:00Z" }],
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
function renderOperationsPage() {
  render(<ToastProvider><OperationsPage /></ToastProvider>);
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
  test("renders all operation areas", async () => {
    render(<OperationsPage />);
    for (const title of ["Deployment ledger", "Release radar", "AdGuard DNS", "TLS certificates"]) {
      expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("Ship operations")).toBeInTheDocument();
    expect(screen.getByText("Protection enabled")).toBeInTheDocument();
  });
  test("shows newest releases first", async () => {
    const releases = [
      { repo: "old/repo", tag: "v1", url: "https://github.com/old/repo/releases/v1", publishedAt: "2026-08-20T10:00:00Z", acknowledged: false },
      { repo: "new/repo", tag: "v2", url: "https://github.com/new/repo/releases/v2", publishedAt: "2026-08-22T10:00:00Z", acknowledged: false },
    ];
    globalThis.fetch = mock(async () => Response.json(snapshot({ releases }))) as unknown as typeof fetch;
    renderOperationsPage();

    const releaseLinks = await screen.findAllByRole("link");
    expect(releaseLinks.filter((link) => ["old/repo", "new/repo"].includes(link.textContent ?? "")).map((link) => link.textContent)).toEqual(["new/repo", "old/repo"]);
  });

  test("refreshes operation details every 30 seconds", async () => {
    const originalSetInterval = globalThis.setInterval;
    const intervals: Array<{ callback: TimerHandler; delay: number }> = [];
    let requestCount = 0;
    globalThis.setInterval = ((callback: TimerHandler, delay?: number) => {
      intervals.push({ callback, delay: delay ?? 0 });
      return intervals.length;
    }) as unknown as typeof setInterval;
    globalThis.fetch = mock(async () => {
      requestCount += 1;
      return Response.json(snapshot({
        deployments: [{ timestamp: "2026-08-23T10:00:00Z", status: "success", sha: "abcdef123456", subject: requestCount === 1 ? "Initial checks" : "Refreshed checks", stage: "complete" }],
      }));
    }) as unknown as typeof fetch;
    try {
      renderOperationsPage();
      expect(await screen.findByText("Initial checks")).toBeInTheDocument();
      expect(requestCount).toBe(1);
      const refreshInterval = intervals.find((interval) => interval.delay === 30_000);
      expect(refreshInterval).toBeDefined();
      (refreshInterval?.callback as () => void)();
      expect(await screen.findByText("Refreshed checks")).toBeInTheDocument();
      expect(requestCount).toBe(2);
    } finally {
      globalThis.setInterval = originalSetInterval;
    }
  });


  test("never renders the stored AdGuard password", async () => {
    renderOperationsPage();
    await userEvent.click(await screen.findByRole("button", { name: "Configure AdGuard DNS" }));
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
  test("shows settings gears only on configurable cards", async () => {
    renderOperationsPage();
    for (const title of ["Release radar", "AdGuard DNS", "TLS certificates"]) {
      expect(await screen.findByRole("button", { name: `Configure ${title}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Configure Deployment ledger" })).not.toBeInTheDocument();
  });

  test("shows only the active section controls in one dialog", async () => {
    renderOperationsPage();
    const sections = [
      { title: "Release radar", field: "GitHub repositories", absent: ["AdGuard URL", "TLS targets"] },
      { title: "AdGuard DNS", field: "AdGuard URL", absent: ["GitHub repositories", "TLS targets"] },
      { title: "TLS certificates", field: "TLS targets", absent: ["GitHub repositories", "AdGuard URL"] },
    ];

    for (const section of sections) {
      await userEvent.click(await screen.findByRole("button", { name: `Configure ${section.title}` }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: `${section.title} settings` })).toBeInTheDocument();
      expect(screen.getByLabelText(section.field)).toBeInTheDocument();
      for (const label of section.absent) {
        expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
      }
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    }
  });

  test("discards edits when a settings modal closes", async () => {
    renderOperationsPage();
    await userEvent.click(await screen.findByRole("button", { name: "Configure Release radar" }));
    const repositories = screen.getByLabelText("GitHub repositories") as HTMLTextAreaElement;
    await userEvent.clear(repositories);
    await userEvent.type(repositories, "changed/repo");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Release radar settings" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Configure Release radar" }));
    expect((screen.getByLabelText("GitHub repositories") as HTMLTextAreaElement).value).toBe("n8n-io/n8n");
  });

  test("saves only the active configuration section", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (_input, init) => {
      if (init?.method === "PUT") payloads.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json(snapshot());
    }) as unknown as typeof fetch;
    renderOperationsPage();

    await userEvent.click(await screen.findByRole("button", { name: "Configure Release radar" }));
    fireEvent.change(screen.getByLabelText("GitHub repositories"), { target: { value: "owner/one\n\n owner/two " } });
    await userEvent.click(screen.getByRole("button", { name: "Save release settings" }));
    await waitFor(() => expect(payloads).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Configure AdGuard DNS" }));
    fireEvent.change(screen.getByLabelText("AdGuard URL"), { target: { value: "http://new-adguard.test" } });
    await userEvent.click(screen.getByRole("button", { name: "Save AdGuard settings" }));
    await waitFor(() => expect(payloads).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Configure TLS certificates" }));
    fireEvent.change(screen.getByLabelText("TLS targets"), { target: { value: "Site,site.test,8443\n" } });
    await userEvent.click(screen.getByRole("button", { name: "Save TLS settings" }));
    await waitFor(() => expect(payloads).toHaveLength(3));

    expect(payloads).toEqual([
      { githubRepos: ["owner/one", "owner/two"] },
      { adguardUrl: "http://new-adguard.test", adguardUsername: "admin" },
      { tlsTargets: [{ name: "Site", host: "site.test", port: 8443 }] },
    ]);
  });

  test("omits a blank AdGuard password from the save payload", async () => {
    let payload: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_input, init) => {
      if (init?.method === "PUT") payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json(snapshot());
    }) as unknown as typeof fetch;
    renderOperationsPage();

    await userEvent.click(await screen.findByRole("button", { name: "Configure AdGuard DNS" }));
    expect((screen.getByLabelText("AdGuard password") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("AdGuard username"), { target: { value: "operator" } });
    await userEvent.click(screen.getByRole("button", { name: "Save AdGuard settings" }));
    await waitFor(() => expect(payload).toBeDefined());

    expect(payload).toEqual({ adguardUrl: "http://adguard.test", adguardUsername: "operator" });
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });


});
