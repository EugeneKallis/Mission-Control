/**
 * Unit tests for session-sidebar.tsx — Pi session list panel.
 */
import { describe, test, expect, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@/test-utils/render";
import { SessionSidebar } from "./session-sidebar";

const MOCK_SESSIONS = [
  {
    id: "mc-abc123",
    name: "Project Setup",
    lastModified: new Date(Date.now() - 60_000).toISOString(),
    messageCount: 15,
    size: 4096,
  },
  {
    id: "mc-def456",
    name: "Debug Session",
    lastModified: new Date(Date.now() - 3_600_000).toISOString(),
    messageCount: 42,
    size: 8192,
  },
  {
    id: "mc-ghi789",
    name: "--Users-ponzi-dev-mission-control--",
    lastModified: new Date(Date.now() - 86400_000).toISOString(),
    messageCount: 8,
    size: 2048,
  },
];

let fetchMock: typeof globalThis.fetch;
const mockOnSwitch = mock();
const mockOnNew = mock();
const mockOnClose = mock();

describe("SessionSidebar", () => {
  afterEach(() => {
    cleanup();
    mockOnSwitch.mockReset();
    mockOnNew.mockReset();
    mockOnClose.mockReset();
    globalThis.fetch = fetchMock;
  });

  beforeEach(() => {
    fetchMock = globalThis.fetch;
  });

  test("renders nothing when closed", () => {
    const { container } = render(
      <SessionSidebar
        open={false}
        onClose={mockOnClose}
        activeSessionId={null}
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );
    expect(container.textContent).toBe("");
  });

  test("renders session list when open", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: MOCK_SESSIONS }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId="mc-abc123"
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Project Setup")).toBeTruthy();
      expect(screen.getByText("Debug Session")).toBeTruthy();
    });
  });

  test("highlights active session", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: MOCK_SESSIONS }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId="mc-abc123"
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      // Active session should have a check_circle icon
      expect(screen.getByText("check_circle")).toBeTruthy();
    });
  });

  test("calls onSwitchSession when an inactive session is clicked", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: MOCK_SESSIONS }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId="mc-abc123"
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Debug Session")).toBeTruthy();
    });

    // Click on inactive session
    fireEvent.click(screen.getByText("Debug Session"));
    expect(mockOnSwitch).toHaveBeenCalledWith("mc-def456");
  });

  test("does not call onSwitchSession when active session is clicked", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: MOCK_SESSIONS }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId="mc-abc123"
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Project Setup")).toBeTruthy();
    });

    // Click on active session — should not call switch
    fireEvent.click(screen.getByText("Project Setup"));
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  test("calls onNewSession when new button is clicked", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: [] }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId={null}
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    // Find the add_circle button (new session)
    const newBtn = screen.getByTitle("New session");
    fireEvent.click(newBtn);
    expect(mockOnNew).toHaveBeenCalled();
  });

  test("calls onClose when close button is clicked", () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: [] }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId={null}
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    const closeBtn = screen.getByTitle("Close");
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalled();
  });

  test("shows truncated name for raw Pi directory IDs", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: MOCK_SESSIONS }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId={null}
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      // The third session has a raw Pi directory name — should strip surrounding --
      expect(screen.getByText("Users-ponzi-dev-mission-control")).toBeTruthy();
    });
  });

  test("shows empty state when no sessions", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: [] }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId={null}
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/No saved sessions/)).toBeTruthy();
    });
  });

  test("shows error state on fetch failure", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("Network failure"))) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId={null}
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network failure/)).toBeTruthy();
    });
  });

  test("shows relative time for sessions", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: MOCK_SESSIONS }))),
    ) as unknown as typeof globalThis.fetch;

    render(
      <SessionSidebar
        open={true}
        onClose={mockOnClose}
        activeSessionId={null}
        onSwitchSession={mockOnSwitch}
        onNewSession={mockOnNew}
      />,
    );

    await waitFor(() => {
      // 1 minute ago
      expect(screen.getByText("1m ago")).toBeTruthy();
      // 1 hour ago
      expect(screen.getByText("1h ago")).toBeTruthy();
    });
  });
});
