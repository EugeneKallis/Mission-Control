/**
 * Tests for slash-autocomplete keyboard navigation.
 */

import { describe, test, expect, beforeEach, mock, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent, waitFor } from "@/test-utils/render";
import { useSlashAutocomplete, type SlashCommand } from "./slash-autocomplete";

// ── Mock component that uses the hook with a textarea ──────────────────────

interface DropdownProps {
  filtered: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand | string) => void;
}

function Dropdown({ filtered, activeIndex, onSelect }: DropdownProps) {
  return (
    <ul data-testid="dropdown" className="max-h-48 overflow-y-auto">
      {filtered.map((cmd, i) => (
        <li
          key={cmd.value}
          data-idx={i}
          data-active={i === activeIndex ? "true" : undefined}
          data-command={cmd.type === "command" ? "true" : undefined}
          className={i === activeIndex ? "active" : "inactive"}
        >
          {cmd.label}
        </li>
      ))}
    </ul>
  );
}

interface HarnessProps {
  initialValue?: string;
  onInsert?: (text: string | SlashCommand) => void;
  onSelection?: (value: string) => void;
}

function Harness({ initialValue = "", onInsert, onSelection }: HarnessProps) {
  const [value, setValue] = (function () {
    return [initialValue, (v: string) => { /* controlled by user input only */ void v; }];
  })();
  const result = useSlashAutocomplete(value, (text) => {
    onInsert?.(text);
    if (typeof text === "string") setValue(text);
  });

  return (
    <div>
      {result.showAutocomplete && result.filtered.length > 0 && (
        <Dropdown
          filtered={result.filtered}
          activeIndex={result.activeIndex}
          onSelect={(cmd) => {
            if (typeof cmd === "string") return;
            const slashIdx = value.lastIndexOf("/");
            const before = value.slice(0, slashIdx);
            const inserted = before + cmd.value + " ";
            onInsert?.(inserted);
            onSelection?.(cmd.value);
            setValue(inserted);
          }}
        />
      )}
      <textarea
        data-testid="textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => result.handleKeyDown(e)}
      />
    </div>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SlashAutocomplete keyboard navigation", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            skills: [
              { name: "code-review", description: "Review code", enabled: true },
              { name: "deploy", description: "Deploy app", enabled: true },
              { name: "test", description: "Run tests", enabled: true },
            ],
          }),
        ),
      ),
    ) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  test("dropdown shows items with first item active by default", async () => {
    render(<Harness initialValue="/co" />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });
    const active = screen.getByText("code-review");
    expect(active.getAttribute("data-active")).toBe("true");
  });

  test("ArrowDown moves active index down", async () => {
    // Use a value that matches multiple skills (empty filter or single char)
    render(<Harness initialValue="/" />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });

    // First item should be active by default
    const items = screen.getAllByRole("listitem");
    expect(items[0].getAttribute("data-active")).toBe("true");

    const textarea = screen.getByTestId("textarea");
    fireEvent.keyDown(textarea, { key: "ArrowDown" });

    // After arrowdown, second item should be active
    await waitFor(() => {
      const items2 = screen.getAllByRole("listitem");
      expect(items2[1].getAttribute("data-active")).toBe("true");
    });
  });

  test("ArrowUp wraps to last item from first", async () => {
    render(<Harness initialValue="/" />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });

    const textarea = screen.getByTestId("textarea");
    fireEvent.keyDown(textarea, { key: "ArrowUp" });

    // After arrowup from 0, should wrap to last
    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      const last = items[items.length - 1];
      expect(last.getAttribute("data-active")).toBe("true");
    });
  });

  test("Enter selects the active command and closes dropdown", async () => {
    let inserted: string | SlashCommand = "";
    render(<Harness initialValue="/co" onInsert={(t) => { inserted = t; }} />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });

    const textarea = screen.getByTestId("textarea");
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(inserted).toBe("/skill:code-review ");
    // Dropdown should be closed
    await waitFor(() => {
      expect(screen.queryByTestId("dropdown")).toBeNull();
    });
  });

  test("/new is a built-in command", async () => {
    // Use a single / to show all commands (built-in + skills)
    render(<Harness initialValue="/" />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });
    // Built-in commands are tagged with data-command="true"
    const commandItems = screen.getAllByRole("listitem").filter(
      (el) => el.getAttribute("data-command") === "true",
    );
    const labels = commandItems.map((el) => el.textContent);
    expect(labels).toContain("new");
    expect(labels).toContain("clear");
  });

  test("Enter on /new passes the SlashCommand object (not text)", async () => {
    let received: string | SlashCommand = "";
    render(<Harness initialValue="/n" onInsert={(t) => { received = t; }} />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });

    // /n matches "new" (the built-in command)
    const textarea = screen.getByTestId("textarea");
    fireEvent.keyDown(textarea, { key: "Enter" });

    // For built-in commands, the parent receives the SlashCommand object
    expect(typeof received).toBe("object");
    const cmd = received as unknown as SlashCommand;
    expect(cmd.commandId).toBe("new");
    expect(cmd.value).toBe("/new");
  });

  test("Enter on /clear passes the SlashCommand object", async () => {
    let received: string | SlashCommand = "";
    render(<Harness initialValue="/cl" onInsert={(t) => { received = t; }} />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });

    const textarea = screen.getByTestId("textarea");
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(typeof received).toBe("object");
    expect((received as unknown as SlashCommand).commandId).toBe("clear");
  });

  test("Enter on a skill passes the insertion text (not an object)", async () => {
    let received: string | SlashCommand = "";
    render(<Harness initialValue="/co" onInsert={(t) => { received = t; }} />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });

    const textarea = screen.getByTestId("textarea");
    fireEvent.keyDown(textarea, { key: "Enter" });

    // For skills, the parent receives the insertion text
    expect(typeof received).toBe("string");
    expect(received).toBe("/skill:code-review ");
  });

  test("Escape closes the dropdown", async () => {
    render(<Harness initialValue="/co" />);
    await waitFor(() => {
      expect(screen.getByTestId("dropdown")).toBeTruthy();
    });

    const textarea = screen.getByTestId("textarea");
    fireEvent.keyDown(textarea, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("dropdown")).toBeNull();
    });
  });
});
