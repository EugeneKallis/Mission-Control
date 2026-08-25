import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { DockerLogsPage } from "./docker-logs-page";

const endpoint = {
  id: 1,
  name: "Main Docker",
  apiUrl: "http://192.168.1.111:8080",
  enabled: true,
  order: 0,
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners = new Map<string, (event: Event) => void>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, listener);
  }

  close() {}

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    if (type === "message") this.onmessage?.(event);
    this.listeners.get(type)?.(event);
  }
}

const originalFetch = globalThis.fetch;
const originalEventSource = globalThis.EventSource;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.EventSource = originalEventSource;
  FakeEventSource.instances = [];
});

describe("DockerLogsPage", () => {
  test("groups containers by configured instance and renders live stats", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify([endpoint]))) as unknown as typeof fetch;
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

    render(<DockerLogsPage />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const source = FakeEventSource.instances[0];
    source.onopen?.();
    source.emit("containers-changed", [{
      id: "abc",
      name: "web",
      image: "nginx:latest",
      state: "running",
      host: "host-1",
      stats: [{ id: "", cpu: 12.5, memory: 25.5, memoryUsage: 1024 }],
    }]);
    source.emit("container-stat", { id: "abc", cpu: 13, memory: 26, memoryUsage: 2048 });

    expect(await screen.findByText("Main Docker")).toBeInTheDocument();
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("13.0%")).toBeInTheDocument();
    expect(screen.getByText("26.0%")).toBeInTheDocument();
  });

  test("shows an unreachable status while keeping the last-known section", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify([endpoint]))) as unknown as typeof fetch;
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

    render(<DockerLogsPage />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0];
    source.emit("containers-changed", [{ id: "abc", name: "web", image: "nginx", state: "running", host: "host-1" }]);
    source.onerror?.();

    expect(await screen.findByText("unreachable")).toBeInTheDocument();
    expect(screen.getByText("web")).toBeInTheDocument();
  });

  test("opens instance management", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify([]))) as unknown as typeof fetch;
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

    render(<DockerLogsPage />);
    await screen.findByRole("button", { name: "Manage Instances" });
    fireEvent.click(screen.getAllByRole("button", { name: "Manage Instances" })[0]);
    expect(screen.getByRole("heading", { name: "Docker Logs Instances" })).toBeInTheDocument();
  });
});
