/**
 * ToolCallCard — displays a tool execution in the Pi chat.
 *
 * Collapsible card showing tool name, args, and a per-tool styled
 * result block (bash → terminal, read → file preview, edit → diff,
 * write → creation indicator).
 */

"use client";

import { useState } from "react";
import { renderToolResult, type ToolResultMeta } from "./tool-result-renderers";
import type { ToolCallDisplay } from "./pi-chat-types";
import { truncate } from "@/lib/format";

/** Props exposed for use from pi-chat-page */
export interface ToolCallCardProps {
  tc: ToolCallDisplay;
}

export function ToolCallCard({ tc }: ToolCallCardProps) {
  const [open, setOpen] = useState(tc.status !== "complete");

  const statusIcon = {
    pending: "hourglass_empty",
    running: "progress_activity",
    complete: "check_circle",
    error: "error",
  }[tc.status];

  const statusColor = {
    pending: "text-on-surface-variant/50",
    running: "text-primary",
    complete: "text-green-500",
    error: "text-error",
  }[tc.status];

  // Build the meta for the result renderer
  const resultMeta: ToolResultMeta = {
    toolName: tc.toolName,
    args: tc.args,
    result: tc.result,
    status: tc.status,
  };

  return (
    <div className="border border-outline-variant/20 bg-surface-container-low/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <span
          className={`material-symbols-outlined text-sm ${
            statusColor
          } ${tc.status === "running" ? "animate-spin" : ""}`}
        >
          {statusIcon}
        </span>
        <code className="font-mono text-[11px]">{tc.toolName}</code>
        <span className="text-[10px] text-on-surface-variant/50 truncate flex-1">
          {tc.args ? truncate(tc.args, 60) : ""}
        </span>
        <span className="material-symbols-outlined text-sm text-on-surface-variant/40">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2 space-y-1">
          {/* Args */}
          {tc.args && (
            <div className="text-[11px] font-mono text-on-surface-variant/60 whitespace-pre-wrap mb-1">
              {tc.args}
            </div>
          )}

          {/* Result — per-tool rendering */}
          {renderToolResult(resultMeta)}
        </div>
      )}
    </div>
  );
}
