/**
 * Unit tests for src/components/config/arr-config-modal.tsx
 *
 * Covers:
 *  - Loads stored values from GET /api/config and renders all ten cards
 *  - Bulk import Parse & Fill populates fields from the imported records
 *  - Save issues PUT /api/config with all ten arr_<slug>_url / arr_<slug>_api_key keys
 *  - Cancel calls onClose without saving
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { ToastProvider } from "@/components/toast-provider";
import { ArrConfigModal } from "./arr-config-modal";
import { ARR_INSTANCE_DEFINITIONS, arrConfigDbKey } from "@/lib/arr-config";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

function mockConfigFetch(seed: Record<string, string> = {}, putBodies: Array<Record<string, string>> = []) {
  return mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/api/config") && method === "GET") {
      return new Response(JSON.stringify(seed), { status: 200 });
    }
    if (url.includes("/api/config") && method === "PUT") {
      if (init?.body) putBodies.push(JSON.parse(String(init.body)) as Record<string, string>);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

function renderModal(onClose = mock()) {
  render(
    <ToastProvider>
      <ArrConfigModal onClose={onClose} />
    </ToastProvider>,
  );
  return { onClose };
}

describe("ArrConfigModal", () => {
  test("loads stored values and renders all ten instance cards", async () => {
    globalThis.fetch = mockConfigFetch({
      [arrConfigDbKey("radarr", "url")]: "http://10.0.0.5:7878",
      [arrConfigDbKey("radarr", "api_key")]: "stored-radarr-key",
    });

    renderModal();

    for (const def of ARR_INSTANCE_DEFINITIONS) {
      expect(await screen.findByText(def.name)).toBeInTheDocument();
    }

    // Stored values pre-fill their inputs
    const radarrUrl = await screen.findByPlaceholderText("http://192.168.1.111:7878") as HTMLInputElement;
    expect(radarrUrl.value).toBe("http://10.0.0.5:7878");
    const radarrKey = screen.getByDisplayValue("stored-radarr-key") as HTMLInputElement;
    expect(radarrKey).toBeInTheDocument();
  });

  test("bulk import Parse & Fill populates the matching instance fields", async () => {
    globalThis.fetch = mockConfigFetch();

    renderModal();

    const textarea = await screen.findByPlaceholderText(/radarr/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "radarr\nhttp://10.0.0.9:7878\nimported-key" } });
    fireEvent.click(screen.getByRole("button", { name: /parse & fill/i }));

    await waitFor(() => {
      const url = screen.getByPlaceholderText("http://192.168.1.111:7878") as HTMLInputElement;
      expect(url.value).toBe("http://10.0.0.9:7878");
    });
    expect(screen.getByDisplayValue("imported-key")).toBeInTheDocument();
  });

  test("Save PUTs all ten arr_<slug>_url and arr_<slug>_api_key keys", async () => {
    const putBodies: Array<Record<string, string>> = [];
    globalThis.fetch = mockConfigFetch({}, putBodies);
    const onClose = mock();

    renderModal(onClose);

    const saveButton = await screen.findByRole("button", { name: "Save" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(putBodies.length).toBe(1);

    const body = putBodies[0]!;
    const expectedKeys: string[] = [];
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      expectedKeys.push(arrConfigDbKey(def.slug, "url"), arrConfigDbKey(def.slug, "api_key"));
    }
    expect(Object.keys(body).sort()).toEqual(expectedKeys.sort());
    expect(body[arrConfigDbKey("radarr", "api_key")]).toBe("");
  });

  test("Cancel calls onClose without issuing a PUT", async () => {
    const putBodies: Array<Record<string, string>> = [];
    globalThis.fetch = mockConfigFetch({}, putBodies);
    const onClose = mock();

    renderModal(onClose);

    const cancelButton = await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
    expect(putBodies.length).toBe(0);
  });

  test("failed GET shows an error state, disables Save, and never PUTs blank keys", async () => {
    const putBodies: Array<Record<string, string>> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "PUT") putBodies.push(JSON.parse(String(init?.body)) as Record<string, string>);
      return new Response("server error", { status: 500 });
    }) as unknown as typeof fetch;

    renderModal();

    // Clear error state replaces the editable form — no blank ten-instance cards.
    expect(await screen.findByText(/couldn't load settings/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("http://192.168.1.111:7878")).not.toBeInTheDocument();

    // Attempt Save after the failed GET — it stays disabled and no PUT occurs.
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);

    expect(putBodies.length).toBe(0);
  });

  test("URL and API Key inputs have instance-specific accessible names", async () => {
    globalThis.fetch = mockConfigFetch({
      [arrConfigDbKey("radarr", "url")]: "http://10.0.0.5:7878",
    });

    renderModal();

    const radarrUrl = (await screen.findByLabelText("Radarr URL")) as HTMLInputElement;
    expect(radarrUrl.value).toBe("http://10.0.0.5:7878");
    expect(screen.getByLabelText("Radarr API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("Sonarr URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Sonarr4K API Key")).toBeInTheDocument();

    // Visual label text is preserved alongside the instance-specific names.
    expect(screen.getAllByText("URL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("API Key").length).toBeGreaterThan(0);
  });
});
