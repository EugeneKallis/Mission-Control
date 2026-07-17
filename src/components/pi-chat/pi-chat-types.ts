/**
 * Shared types for the Pi Chat UI components.
 */

export interface ToolCallDisplay {
  toolCallId: string;
  toolName: string;
  args: string;
  status: "pending" | "running" | "complete" | "error";
  result: string;
}
