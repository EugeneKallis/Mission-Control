/**
 * JSON event renderer for Pi --mode json output.
 *
 * Pure function: takes a parsed JSON event object and returns a
 * human-readable transcript line (or null to skip).
 *
 * No child_process, no fs, no DB — pure string manipulation.
 */

/**
 * Truncate a string to a maximum length, adding "…" if truncated.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

/**
 * Extract text content from a message's content array.
 * Each content entry with type "text" contributes its text field.
 */
function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((c: unknown): c is { type: string; text?: string } =>
      typeof c === "object" && c !== null && (c as Record<string, unknown>).type === "text"
    )
    .map((c) => c.text ?? "")
    .join("");
}

/**
 * Render a single parsed JSON event from `pi --mode json` stdout to a
 * human-readable transcript line (or null to skip the event).
 *
 * @param event A parsed JSON event with a `type` field.
 * @returns A string to append to the transcript, or null to skip.
 */
export function renderJsonEvent(event: { type: string } & Record<string, unknown>): string | null {
  switch (event.type) {
    // ── Session / Connection ────────────────────────────────────────────
    case "connected": {
      const sessionId = String(event.sessionId ?? "");
      const cwd = String(event.cwd ?? "");
      return `[session: ${sessionId}] cwd=${cwd}`;
    }

    // ── Agent lifecycle ─────────────────────────────────────────────────
    case "agent_start":
      return "[agent_start]";

    case "agent_end":
      return "[agent_end]";

    case "agent_settled":
      return "[agent_settled]";

    // ── Turn lifecycle ──────────────────────────────────────────────────
    case "turn_start":
      return "[turn_start]";

    case "turn_end":
      return "[turn_end]";

    // ── Message events ──────────────────────────────────────────────────
    case "message_start":
      return null; // too noisy

    case "message_update":
      return null; // too noisy (text deltas)

    case "message_end": {
      const message = event.message as Record<string, unknown> | undefined;
      if (!message) return null;
      const content = message.content;
      const text = extractTextContent(content);
      if (!text) return null;
      return `Assistant: ${text}`;
    }

    // ── Tool execution ──────────────────────────────────────────────────
    case "tool_execution_start": {
      const toolName = String(event.toolName ?? "?");
      const args = event.args as Record<string, unknown> | undefined;
      let argsStr = "";
      if (args) {
        try {
          argsStr = JSON.stringify(args);
        } catch {
          argsStr = String(args);
        }
      }
      return `[tool: ${toolName}] args: ${truncate(argsStr, 300)}`;
    }

    case "tool_execution_update":
      return null; // too noisy

    case "tool_execution_end": {
      const toolName = String(event.toolName ?? "?");
      const isError = Boolean(event.isError);
      const result = event.result as Record<string, unknown> | undefined;
      let summary = "";
      if (result?.content) {
        summary = extractTextContent(result.content);
      }
      const prefix = isError ? "ERROR: " : "";
      return `[tool: ${toolName}] ${prefix}${truncate(summary, 500)}`;
    }

    // ── Compaction ──────────────────────────────────────────────────────
    case "compaction_start": {
      const reason = String(event.reason ?? "?");
      return `[compaction: ${reason}]`;
    }

    case "compaction_end": {
      const reason = String(event.reason ?? "?");
      return `[compaction: ${reason}]`;
    }

    // ── Auto-retry ──────────────────────────────────────────────────────
    case "auto_retry_start": {
      const attempt = String(event.attempt ?? "?");
      const errorMessage = String(event.errorMessage ?? "");
      return `[retry: attempt ${attempt}] ${errorMessage}`;
    }

    case "auto_retry_end": {
      const success = Boolean(event.success);
      const attempt = String(event.attempt ?? "?");
      const status = success ? "success" : "failed";
      const finalError = event.finalError ? String(event.finalError) : "";
      const suffix = finalError ? ` ${finalError}` : "";
      return `[retry: attempt ${attempt} ${status}]${suffix}`;
    }

    // ── Extension errors ────────────────────────────────────────────────
    case "extension_error": {
      const extPath = String(event.extensionPath ?? "?");
      const error = String(event.error ?? "");
      return `[extension_error: ${extPath}] ${error}`;
    }

    // ── Everything else (response, extension_ui_request, queue_update, etc.) ──
    default:
      return null;
  }
}
