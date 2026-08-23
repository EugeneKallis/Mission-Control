import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { CONFIG_FIELDS } from "@/lib/config-fields";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => "/admin/config",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: ConfigPage } = await import("./page");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe("ConfigPage", () => {
  test("renders every canonical field and saves edited expansion config", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/config" && init?.method === "PUT") return Response.json(JSON.parse(String(init.body)));
      if (url === "/api/config") return Response.json({ telegram_chat_id: "old-chat" });
      if (url === "/api/real-debrid/status") return Response.json({ label: "10d", ok: true });
      if (url === "/api/macros") return Response.json([]);
      return Response.json({});
    }) as unknown as typeof fetch;

    render(<ConfigPage />);
    await screen.findByText("Current integrations", { exact: true });

    for (const field of CONFIG_FIELDS) {
      expect(document.getElementById(`config-${field.key}`)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Proxmox endpoints and SSH maps" })).toHaveAttribute("href", "/pve");

    fireEvent.change(document.getElementById("config-telegram_chat_id")!, { target: { value: "new-chat" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const save = calls.find((call) => call.url === "/api/config" && call.init?.method === "PUT");
      expect(save).toBeDefined();
      const body = JSON.parse(String(save!.init!.body)) as Record<string, string>;
      expect(body.telegram_chat_id).toBe("new-chat");
      expect(Object.hasOwn(body, "decypharr_url")).toBe(true);
    });
  });
});
