/**
 * Unit tests for src/components/config/config-fields-modal.tsx
 *
 * Covers:
 *  - Renders a field per passed definition with stored values pre-filled
 *  - Save PUTs only the passed field keys
 *  - Cancel calls onClose without saving
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { ToastProvider } from "@/components/toast-provider";
import { ConfigFieldsModal } from "./config-fields-modal";
import { fieldsForGroup } from "@/lib/config-fields";

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

const DOWNLOAD_FIELDS = fieldsForGroup("downloads");

describe("ConfigFieldsModal", () => {
  test("renders each passed field and pre-fills stored values", async () => {
    globalThis.fetch = mockConfigFetch({
      zurg_url: "http://10.0.0.9:8282",
      zurg_api_key: "zurg-secret",
      real_debrid_api_key: "stored-rd-key",
    });

    render(
      <ToastProvider>
        <ConfigFieldsModal fields={DOWNLOAD_FIELDS} title="Download integrations" icon="cloud_download" onClose={mock()} />
      </ToastProvider>,
    );

    expect(await screen.findByText("Zurg URL")).toBeInTheDocument();
    expect(screen.getByText("Zurg API Key")).toBeInTheDocument();
    expect(screen.getByText("Real-Debrid API Key")).toBeInTheDocument();

    const urlInput = screen.getByLabelText("Zurg URL") as HTMLInputElement;
    expect(urlInput.value).toBe("http://10.0.0.9:8282");
    const zurgKeyInput = screen.getByLabelText("Zurg API Key") as HTMLInputElement;
    expect(zurgKeyInput.value).toBe("zurg-secret");
    expect(zurgKeyInput.type).toBe("password");
    const keyInput = screen.getByLabelText("Real-Debrid API Key") as HTMLInputElement;
    expect(keyInput.value).toBe("stored-rd-key");
    expect(keyInput.type).toBe("password");
  });

  test("Save PUTs only the passed field keys", async () => {
    const putBodies: Array<Record<string, string>> = [];
    globalThis.fetch = mockConfigFetch(
      {
        zurg_url: "http://10.0.0.9:8282",
        zurg_api_key: "zurg-secret",
      },
      putBodies,
    );
    const onClose = mock();

    render(
      <ToastProvider>
        <ConfigFieldsModal fields={DOWNLOAD_FIELDS} title="Download integrations" icon="cloud_download" onClose={onClose} />
      </ToastProvider>,
    );

    const saveButton = await screen.findByRole("button", { name: "Save" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(putBodies.length).toBe(1);

    const body = putBodies[0]!;
    expect(Object.keys(body).sort()).toEqual(["real_debrid_api_key", "zurg_api_key", "zurg_url"]);
    expect(body.pulse_api_key).toBeUndefined();
  });

  test("Cancel calls onClose without issuing a PUT", async () => {
    const putBodies: Array<Record<string, string>> = [];
    globalThis.fetch = mockConfigFetch({}, putBodies);
    const onClose = mock();

    render(
      <ToastProvider>
        <ConfigFieldsModal fields={DOWNLOAD_FIELDS} title="Download integrations" icon="cloud_download" onClose={onClose} />
      </ToastProvider>,
    );

    const cancelButton = await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
    expect(putBodies.length).toBe(0);
  });

  test("failed GET leaves Save disabled and never issues a blank PUT", async () => {
    const putBodies: Array<Record<string, string>> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "PUT") putBodies.push(JSON.parse(String(init?.body)) as Record<string, string>);
      return new Response("server error", { status: 500 });
    }) as unknown as typeof fetch;

    render(
      <ToastProvider>
        <ConfigFieldsModal fields={DOWNLOAD_FIELDS} title="Download integrations" icon="cloud_download" onClose={mock()} />
      </ToastProvider>,
    );

    // Clear error state replaces the editable form.
    expect(await screen.findByText(/couldn't load settings/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Zurg URL")).not.toBeInTheDocument();

    // Attempt Save after the failed GET — it stays disabled and no PUT occurs.
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);

    expect(putBodies.length).toBe(0);
  });
});
