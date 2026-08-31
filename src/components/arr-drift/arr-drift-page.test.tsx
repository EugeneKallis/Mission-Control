import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@/test-utils/render";
import { ArrDriftPage } from "./arr-drift-page";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe("ArrDriftPage", () => {
  test("shows drift details and links to native Arr settings", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      generatedAt: "2026-08-23T00:00:00.000Z",
      baselineSlug: "radarr",
      instances: [
        { slug: "radarr", name: "Radarr", type: "radarr", url: "http://radarr", status: "baseline", differences: [] },
        {
          slug: "radarranime",
          name: "RadarrAnime",
          type: "radarr",
          url: "http://anime",
          status: "drift",
          differences: [{ category: "tags", label: "Tags", detail: "Missing: kids", href: "http://anime/settings/tags" }],
        },
        { slug: "sonarr", name: "Sonarr", type: "sonarr", url: "http://sonarr", status: "incompatible", differences: [] },
      ],
    }))) as unknown as typeof fetch;

    render(<ArrDriftPage />);

    await waitFor(() => expect(screen.getByText("RadarrAnime differs from the selected baseline in 1 setting.")).toBeInTheDocument());
    expect(screen.getByText("Missing: kids")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Arr settings/ })).toHaveAttribute("href", "http://anime/settings/tags");
    expect(screen.getByText("Other Arr type")).toBeInTheDocument();
  });
});
