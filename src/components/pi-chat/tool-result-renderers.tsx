/**
 * Per-tool rendering helpers for the Pi Chat UI.
 *
 * Each tool type (bash, read, edit, write) gets special rendering
 * in the tool call card — terminal output, file preview, diff view,
 * creation indicator — rather than a generic JSON dump.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToolResultMeta {
  toolName: string;
  args: string;          // raw JSON string representation of args
  result: string;        // raw result text
  status: "pending" | "running" | "complete" | "error";
}

// ── Bash: terminal-style output ───────────────────────────────────────────

export function renderBashOutput(result: string): string {
  // Strip ANSI escape sequences for clean display
  return result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

function BashResultView({ result }: { result: string }) {
  const clean = renderBashOutput(result);
  return (
    <pre className="text-[11px] font-mono text-green-400 bg-black/80 p-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-sm">
      {clean || <span className="italic opacity-50">(empty output)</span>}
    </pre>
  );
}

// ── Read: file path + content preview ──────────────────────────────────────

/** Shared helper: extract `path` from tool args. */
function parsePathFromArgs(args: string | Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as Record<string, unknown>;
      return (parsed.path as string) ?? null;
    } catch {
      return null;
    }
  }
  return (args as Record<string, unknown>).path as string ?? null;
}

function ReadResultView({ result, args }: { result: string; args?: Record<string, unknown> }) {
  const filePath = parsePathFromArgs(args);
  const lines = result.split("\n");
  const lineCount = lines.length;

  return (
    <div>
      {filePath && (
        <div className="text-[10px] font-mono text-on-surface-variant/50 mb-1 px-1">
          <span className="material-symbols-outlined text-[10px] align-text-bottom">description</span>
          {" "}{filePath}
          <span className="ml-2 opacity-50">{lineCount} lines</span>
        </div>
      )}
      {result ? (
        <pre className="text-[11px] font-mono text-on-surface bg-surface-container-high p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {result}
        </pre>
      ) : (
        <span className="text-[11px] italic opacity-50 px-1">(empty file)</span>
      )}
    </div>
  );
}

// ── Edit: diff-style rendering ────────────────────────────────────────────

function EditResultView({ result, args }: { result: string; args?: Record<string, unknown> }) {
  const filePath = parsePathFromArgs(args);
  const lines = result.split("\n");
  const hasDiffMarkers = lines.some((l) => l.startsWith("+") || l.startsWith("-") || l.startsWith("@@"));

  return (
    <div>
      {filePath && (
        <div className="text-[10px] font-mono text-on-surface-variant/50 mb-1 px-1">
          <span className="material-symbols-outlined text-[10px] align-text-bottom">edit</span>
          {" "}{filePath}
        </div>
      )}
      {result ? (
        <pre
          className={`text-[11px] font-mono p-2 max-h-40 overflow-y-auto whitespace-pre-wrap ${
            hasDiffMarkers
              ? "bg-surface-container-low text-on-surface"
              : "bg-surface-container-high text-on-surface"
          }`}
        >
          {hasDiffMarkers
            ? lines.map((line, i) => {
                let className = "";
                if (line.startsWith("+")) className = "text-green-500";
                else if (line.startsWith("-")) className = "text-error";
                else if (line.startsWith("@")) className = "text-cyan-500";
                return (
                  <span key={i} className={`block ${className}`}>
                    {line}
                  </span>
                );
              })
            : result}
        </pre>
      ) : (
        <span className="text-[11px] italic opacity-50 px-1">(edit applied)</span>
      )}
    </div>
  );
}

// ── Write: file path + creation indicator ──────────────────────────────────

function WriteResultView({ result, args }: { result: string; args?: Record<string, unknown> }) {
  const filePath = parsePathFromArgs(args);
  return (
    <div>
      {filePath && (
        <div className="text-[10px] font-mono text-on-surface-variant/50 mb-1 px-1 flex items-center gap-1">
          <span className="material-symbols-outlined text-[10px] text-green-500">note_add</span>
          <span className="text-green-500 font-medium">Created</span>
          <span>{filePath}</span>
        </div>
      )}
      {result ? (
        <pre className="text-[11px] font-mono text-on-surface bg-surface-container-high p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {result}
        </pre>
      ) : (
        <span className="text-[11px] italic opacity-50 px-1">(file created)</span>
      )}
    </div>
  );
}

// ── Router: pick the right renderer based on tool name ────────────────────

export function renderToolResult(meta: ToolResultMeta): React.ReactNode {
  const { toolName, result, args } = meta;

  switch (toolName) {
    case "bash":
      return <BashResultView result={result} />;

    case "read":
      return <ReadResultView result={result} args={args ? (() => { try { return JSON.parse(args) as Record<string, unknown>; } catch { return undefined; } })() : undefined} />;

    case "edit":
      return <EditResultView result={result} args={args ? (() => { try { return JSON.parse(args) as Record<string, unknown>; } catch { return undefined; } })() : undefined} />;

    case "write":
      return <WriteResultView result={result} args={args ? (() => { try { return JSON.parse(args) as Record<string, unknown>; } catch { return undefined; } })() : undefined} />;

    default:
      // Generic fallback — show raw result in monospace
      return (
        <pre className="text-[11px] font-mono text-on-surface bg-surface-container-high p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {result || <span className="italic opacity-50">(no output)</span>}
        </pre>
      );
  }
}
