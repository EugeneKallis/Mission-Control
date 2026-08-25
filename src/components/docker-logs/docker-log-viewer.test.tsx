import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { DockerLogViewer } from "./docker-log-viewer";

const container = {
  id: "abc",
  name: "web",
  image: "nginx:latest",
  state: "running",
  host: "host-1",
};

class FakeLogEventSource {
  static instance: FakeLogEventSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  listeners = new Map<string, (event: Event) => void>();

  constructor(public url: string) {
    FakeLogEventSource.instance = this;
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, listener);
  }

  close() {}
}

const originalFetch = globalThis.fetch;
const originalEventSource = globalThis.EventSource;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.EventSource = originalEventSource;
  FakeLogEventSource.instance = null;
  window.localStorage.clear();
});

describe("DockerLogViewer", () => {
  test("loads a recent backfill and appends live messages", async () => {
    globalThis.fetch = mock(async () => new Response('{"ts":1,"m":"old line","l":"info","s":"stdout"}\n')) as unknown as typeof fetch;
    globalThis.EventSource = FakeLogEventSource as unknown as typeof EventSource;

    render(<DockerLogViewer endpointId={1} container={container} onClose={mock()} />);
    await waitFor(() => expect(FakeLogEventSource.instance).not.toBeNull());
    const source = FakeLogEventSource.instance!;
    source.onopen?.();
    source.onmessage?.({ data: JSON.stringify({ ts: 2, m: "new line", l: "error", s: "stderr" }) } as MessageEvent);

    expect(await screen.findByText("old line")).toBeInTheDocument();
    expect(await screen.findByText("new line")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter logs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  test("allows the backfill size to advance", async () => {
    const fetchMock = mock(async () => new Response(""));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    globalThis.EventSource = FakeLogEventSource as unknown as typeof EventSource;

    render(<DockerLogViewer endpointId={1} container={container} onClose={mock()} />);
    await screen.findByRole("combobox", { name: "Backfill" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole("combobox", { name: "Backfill" })).toHaveValue("300");
  });
});
