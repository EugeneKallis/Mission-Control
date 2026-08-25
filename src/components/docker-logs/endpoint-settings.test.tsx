import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@/test-utils/render";
import { EndpointSettings } from "./endpoint-settings";

const endpoint = {
  id: 1,
  name: "Main Docker",
  apiUrl: "http://192.168.1.111:8080",
  enabled: true,
  order: 0,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Docker Logs EndpointSettings", () => {
  test("opens the create form and exposes the endpoint fields", () => {
    render(<EndpointSettings endpoints={[endpoint]} onClose={mock()} onSaved={mock()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Instance" }));

    expect(screen.getByRole("heading", { name: "Add Docker Logs Instance" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Dozzle URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Enabled")).toBeInTheDocument();
  });

  test("gives configured instances accessible edit actions", () => {
    render(<EndpointSettings endpoints={[endpoint]} onClose={mock()} onSaved={mock()} />);
    expect(screen.getByRole("button", { name: "Edit Main Docker" })).toBeInTheDocument();
  });

  test("creates an instance", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ id: 2 }), { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onSaved = mock();
    render(<EndpointSettings endpoints={[]} onClose={mock()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Instance" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Backup Docker" } });
    fireEvent.change(screen.getByLabelText("Dozzle URL"), { target: { value: "http://192.168.1.99:8080" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add Instance" }).at(-1)!);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledWith("/api/docker-logs/endpoints", expect.objectContaining({ method: "POST" }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
