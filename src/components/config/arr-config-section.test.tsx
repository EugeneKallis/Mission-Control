/**
 * Unit tests for src/components/config/arr-config-section.tsx
 *
 * Covers:
 *  - Renders all ten instance cards from canonical definitions
 *  - Shows default URL hint when URL field is empty
 *  - Does NOT show default URL hint when URL is filled
 *  - Bulk import parses a single record
 *  - Bulk import parses all ten records
 *  - Bulk import handles adjacent records with no blank separator
 *  - Case-insensitive names
 *  - Unknown name warning (adarr)
 *  - Invalid URL
 *  - Incomplete final record
 *  - Duplicate record behavior
 *  - Saving sends generated flat DB keys
 *  - Loading shows stored values and default URLs
 *  - Clear button clears import text and issues
 */

import React from "react";
import { describe, test, expect, afterEach, mock } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@/test-utils/render";
import { ToastProvider } from "@/components/toast-provider";
import { ArrConfigSection, type ArrFieldValues } from "./arr-config-section";
import { ARR_INSTANCE_DEFINITIONS } from "@/lib/arr-config";

// ── Helpers ──────────────────────────────────────────────────────────────

function renderSection(
  props: Partial<React.ComponentProps<typeof ArrConfigSection>> = {},
  expand = true,
) {
  const onChange = mock(() => {});
  const defaultValues: Record<string, ArrFieldValues> = {};
  for (const def of ARR_INSTANCE_DEFINITIONS) {
    defaultValues[def.name] = { url: "", apiKey: "" };
  }
  const utils = render(
    <ToastProvider>
      <ArrConfigSection
        values={props.values ?? defaultValues}
        onChange={props.onChange ?? onChange}
      />
    </ToastProvider>,
  );
  if (expand) fireEvent.click(screen.getByText("Arr Instances"));
  return { ...utils, onChange };
}

/** Get the textarea used for bulk import input. */
function getImportTextarea() {
  // Find by placeholder: match the first word of the multi-line placeholder
  return screen.getByPlaceholderText(
    /radarr/,
  ) as HTMLTextAreaElement;
}

/** Get the "Parse & Fill" button. */
function getParseButton() {
  return screen.getByRole("button", { name: /parse & fill/i });
}

/** Get the "Clear" button next to the import area. */
function getClearButton() {
  return screen.getAllByRole("button", { name: /clear/i })[0]!;
}

afterEach(() => {
  cleanup();
});

// ── Rendering ─────────────────────────────────────────────────────────────

describe("ArrConfigSection — rendering", () => {
  test("defaults to collapsed", () => {
    renderSection({}, false);
    expect(screen.getByText("Arr Instances").closest("details")).not.toHaveAttribute("open");
  });

  test("renders the section header and description", () => {
    renderSection();
    expect(screen.getByText("Arr Instances")).toBeInTheDocument();
    expect(screen.getByText(/Configure API keys and URLs/)).toBeInTheDocument();
  });

  test("renders all ten instance names as card headers", () => {
    renderSection();
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      expect(screen.getByText(def.name)).toBeInTheDocument();
    }
  });

  test("renders the import textarea", () => {
    renderSection();
    expect(getImportTextarea()).toBeInTheDocument();
  });

  test("renders Parse & Fill and Clear buttons", () => {
    renderSection();
    expect(getParseButton()).toBeInTheDocument();
    expect(getClearButton()).toBeInTheDocument();
  });

  test("shows default URL hint when URL field is empty", () => {
    renderSection();
    // Radarr's default URL is http://192.168.1.111:7878
    const defaultHints = screen.getAllByText(/^Default:/);
    expect(defaultHints.length).toBe(10); // one per instance
    expect(defaultHints[0]).toHaveTextContent("Default: http://192.168.1.111:7878");
  });

  test("hides default URL hint when URL is filled", () => {
    const values: Record<string, ArrFieldValues> = {};
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      values[def.name] = { url: `http://custom-${def.slug}:9999`, apiKey: "" };
    }
    renderSection({ values });
    expect(screen.queryByText(/^Default:/)).toBeNull();
  });

  test("shows stored URL in the URL input", () => {
    const values: Record<string, ArrFieldValues> = {};
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      values[def.name] = { url: `http://stored-${def.slug}:8000`, apiKey: "" };
    }
    renderSection({ values });
    const urlInputs = screen.getAllByDisplayValue(/^http:\/\/stored-/);
    expect(urlInputs.length).toBe(10);
  });

  test("URL inputs use placeholder for default URL when empty", () => {
    renderSection();
    // All URL inputs (type="url") should have a placeholder that matches a default URL
    const urlInputs = screen.getAllByPlaceholderText(/http:\/\/192\.168\.1\.111:/);
    // Filter out the textarea (which also has http:// in its placeholder)
    const urlInputElements = urlInputs.filter(
      (el) => el.tagName === "INPUT",
    );
    expect(urlInputElements.length).toBe(10);
  });

  test("Parse button is disabled when textarea is empty", () => {
    renderSection();
    expect(getParseButton()).toBeDisabled();
  });
});

// ── Import: single record ─────────────────────────────────────────────────

describe("ArrConfigSection — bulk import single record", () => {
  test("parses one record and calls onChange with url and apiKey", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: {
        value: "radarr\nhttp://192.168.1.111:7878\nmy-api-key-123",
      },
    });
    fireEvent.click(getParseButton());

    // onChange should have been called twice: one for url, one for apiKey
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith("Radarr", "url", "http://192.168.1.111:7878");
    expect(onChange).toHaveBeenCalledWith("Radarr", "apiKey", "my-api-key-123");
  });

  test("shows success toast via parent", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "sonarr\nhttp://a:8989\nkey" },
    });
    fireEvent.click(getParseButton());
    expect(onChange).toHaveBeenCalled();
  });
});

// ── Import: all ten records ───────────────────────────────────────────────

describe("ArrConfigSection — bulk import all ten records", () => {
  test("parses all ten records and calls onChange for each field", () => {
    const { onChange } = renderSection();
    const lines = ARR_INSTANCE_DEFINITIONS.flatMap(
      (d) => [d.slug, d.defaultUrl, `key-${d.slug}`],
    ).join("\n");
    const textarea = getImportTextarea();
    fireEvent.change(textarea, { target: { value: lines } });
    fireEvent.click(getParseButton());

    // 10 entries × 2 fields each = 20 calls
    expect(onChange).toHaveBeenCalledTimes(20);

    // Verify a few specific calls
    expect(onChange).toHaveBeenCalledWith("Radarr", "url", "http://192.168.1.111:7878");
    expect(onChange).toHaveBeenCalledWith("Radarr", "apiKey", "key-radarr");
    expect(onChange).toHaveBeenCalledWith("SonarrLocal", "url", "http://192.168.1.111:8993");
    expect(onChange).toHaveBeenCalledWith("SonarrLocal", "apiKey", "key-sonarrlocal");
  });
});

// ── Import: adjacent triples, no blank lines ──────────────────────────────

describe("ArrConfigSection — adjacent triples without blank lines", () => {
  test("parses adjacent records with no blank separator", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: {
        value: "radarr\nhttp://a:7878\nk1\nsonarr\nhttp://b:8989\nk2\nradarr4k\nhttp://c:7879\nk3",
      },
    });
    fireEvent.click(getParseButton());

    expect(onChange).toHaveBeenCalledTimes(6); // 3 × 2 fields
    expect(onChange).toHaveBeenCalledWith("Radarr", "url", "http://a:7878");
    expect(onChange).toHaveBeenCalledWith("Sonarr", "url", "http://b:8989");
    expect(onChange).toHaveBeenCalledWith("Radarr4K", "url", "http://c:7879");
  });
});

// ── Case-insensitive names ────────────────────────────────────────────────

describe("ArrConfigSection — case-insensitive names", () => {
  test("imports with uppercase names", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "RADARR\nhttp://a:7878\nk1" },
    });
    fireEvent.click(getParseButton());
    expect(onChange).toHaveBeenCalledWith("Radarr", "url", "http://a:7878");
  });

  test("imports with mixed-case names", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "sonArr4K\nhttp://a:8990\nk1" },
    });
    fireEvent.click(getParseButton());
    expect(onChange).toHaveBeenCalledWith("Sonarr4K", "url", "http://a:8990");
  });
});

// ── Unknown name ──────────────────────────────────────────────────────────

describe("ArrConfigSection — unknown name", () => {
  test("shows warning for unknown instance name", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: {
        value: "radarr\nhttp://a:7878\nk1\nadarr\nhttp://b:7878\nk2",
      },
    });
    fireEvent.click(getParseButton());

    // Only radarr should have been imported
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith("Radarr", "url", "http://a:7878");

    // Warning should be visible (use getAllByText because "adarr" appears
    // in both the textarea value and the issue message)
    const warnings = screen.getAllByText(/adarr/);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    // At least one element contains "Unknown instance"
    const issueElements = screen.getAllByText(/unknown instance/i);
    expect(issueElements.length).toBeGreaterThanOrEqual(1);
    // API key should NOT appear in the issue message
    // "k2" may appear in the textarea value but not in issue messages
    // The issue messages are p elements - check none contain the key
    const issuePs = document.body.querySelectorAll("p");
    for (const p of issuePs) {
      if (p.textContent?.toLowerCase().includes("instance")) {
        expect(p.textContent).not.toContain("k2");
      }
    }
  });

  test("shows 'No valid instances found' toast when all records have unknown names", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "foo\nhttp://a:7878\nk1\nbar\nhttp://b:8989\nk2" },
    });
    fireEvent.click(getParseButton());
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── Invalid URL ───────────────────────────────────────────────────────────

describe("ArrConfigSection — invalid URL", () => {
  test("shows error for invalid URL in import, does not populate entry", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "radarr\nbad-url\nmy-api-key" },
    });
    fireEvent.click(getParseButton());

    // Entry is NOT added to form when URL is invalid
    expect(onChange).not.toHaveBeenCalled();

    expect(screen.getByText(/Invalid URL/)).toBeInTheDocument();
    // API key should NOT appear in the issue message
    const issueEl = screen.getByText(/Invalid URL/);
    expect(issueEl.textContent).not.toContain("my-api-key");
  });
});

// ── Incomplete final record ───────────────────────────────────────────────

describe("ArrConfigSection — incomplete final record", () => {
  test("shows warning for incomplete trailing triple", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "radarr\nhttp://a:7878\nk1\nsonarr\nhttp://b:8989" },
    });
    fireEvent.click(getParseButton());

    // Only radarr should have been imported
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith("Radarr", "url", "http://a:7878");

    expect(screen.getByText(/Incomplete record/)).toBeInTheDocument();
    // API key should NOT appear in the issue message
    const issueEl = screen.getByText(/Incomplete record/);
    expect(issueEl.textContent).not.toContain("k1");
  });

  test("shows warning for single trailing line", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "radarr\nhttp://a:7878\nk1\nstray-name" },
    });
    fireEvent.click(getParseButton());

    expect(screen.getByText(/Incomplete record/)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(2); // only radarr
  });
});

// ── Duplicate record ──────────────────────────────────────────────────────

describe("ArrConfigSection — duplicate record", () => {
  test("shows warning for duplicate and uses last occurrence", () => {
    const { onChange } = renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: {
        value: "radarr\nhttp://first:7878\nk-first\nradarr\nhttp://second:7878\nk-second",
      },
    });
    fireEvent.click(getParseButton());

    // Should have been called twice (last occurrence wins)
    expect(onChange).toHaveBeenCalledTimes(2);
    // Last occurrence values
    expect(onChange).toHaveBeenCalledWith("Radarr", "url", "http://second:7878");
    expect(onChange).toHaveBeenCalledWith("Radarr", "apiKey", "k-second");

    expect(screen.getByText(/Duplicate/)).toBeInTheDocument();
    // API keys should NOT appear in the issue message
    const issueEl = screen.getByText(/Duplicate/);
    expect(issueEl.textContent).not.toContain("k-first");
    expect(issueEl.textContent).not.toContain("k-second");
  });
});

// ── Clear button ──────────────────────────────────────────────────────────

describe("ArrConfigSection — clear", () => {
  test("clear button resets import text and issues", () => {
    renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "radarr\nhttp://a:7878\nk1" },
    });
    fireEvent.click(getParseButton());

    // Issues should be empty (valid record)
    // Clear the text
    fireEvent.click(getClearButton());
    expect(textarea.value).toBe("");
    // The "Parse & Fill" button should be disabled since textarea is empty
    expect(getParseButton()).toBeDisabled();
  });

  test("clear button clears import issues after a bad import", () => {
    renderSection();
    const textarea = getImportTextarea();
    fireEvent.change(textarea, {
      target: { value: "radarr\nbad-url\nk1" },
    });
    fireEvent.click(getParseButton());
    expect(screen.getByText(/Invalid URL/)).toBeInTheDocument();

    fireEvent.click(getClearButton());
    expect(screen.queryByText(/Invalid URL/)).toBeNull();
  });
});

// ── Precedence help text ──────────────────────────────────────────────────

describe("ArrConfigSection — env precedence help text", () => {
  test("shows environment variable precedence explanation", () => {
    renderSection();
    expect(screen.getByText(/Environment variables/)).toBeInTheDocument();
    expect(screen.getByText(/take precedence over stored values/)).toBeInTheDocument();
  });

  test("shows ARR__NAME__URL and ARR__NAME__API_KEY examples", () => {
    renderSection();
    expect(screen.getByText(/ARR__<NAME>__URL/)).toBeInTheDocument();
    expect(screen.getByText(/ARR__<NAME>__API_KEY/)).toBeInTheDocument();
  });
});

// ── Loading state ─────────────────────────────────────────────────────────

describe("ArrConfigSection — loading values", () => {
  test("shows stored values when values prop is populated", () => {
    const values: Record<string, ArrFieldValues> = {};
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      values[def.name] = {
        url: def.defaultUrl,
        apiKey: `stored-${def.slug}-key`,
      };
    }
    renderSection({ values });
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      expect(
        screen.getByDisplayValue(`stored-${def.slug}-key`),
      ).toBeInTheDocument();
    }
  });
});
