/**
 * TypeScript types for the Pi RPC protocol (pi --mode rpc).
 *
 * This mirrors the JSONL protocol documented at
 * https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/rpc.md
 */

// ── RPC Commands (sent to stdin) ──────────────────────────────────────────

export interface RpcPrompt {
  type: "prompt";
  message: string;
  /** Required if agent is already streaming. */
  streamingBehavior?: "steer" | "followUp";
  images?: ImageContent[];
}

export interface RpcSteer {
  type: "steer";
  message: string;
  images?: ImageContent[];
}

export interface RpcFollowUp {
  type: "follow_up";
  message: string;
  images?: ImageContent[];
}

export interface RpcAbort {
  type: "abort";
}

export interface RpcNewSession {
  type: "new_session";
  parentSession?: string;
}

export interface RpcGetState {
  type: "get_state";
}

export interface RpcGetMessages {
  type: "get_messages";
}

export interface RpcSetModel {
  type: "set_model";
  provider: string;
  modelId: string;
}

export interface RpcGetAvailableModels {
  type: "get_available_models";
}

export interface RpcSetThinkingLevel {
  type: "set_thinking_level";
  level: ThinkingLevel;
}

export interface RpcCycleModel {
  type: "cycle_model";
}

export interface RpcCycleThinkingLevel {
  type: "cycle_thinking_level";
}

export interface RpcCompact {
  type: "compact";
  customInstructions?: string;
}

export interface RpcGetSessionStats {
  type: "get_session_stats";
}

export interface RpcSwitchSession {
  type: "switch_session";
  sessionPath: string;
}

export interface RpcFork {
  type: "fork";
  entryId: string;
}

export interface RpcClone {
  type: "clone";
}

export interface RpcGetEntries {
  type: "get_entries";
  since?: string;
}

export interface RpcGetTree {
  type: "get_tree";
}

export interface RpcSetSessionName {
  type: "set_session_name";
  name: string;
}

export interface RpcGetCommands {
  type: "get_commands";
}

export interface RpcBash {
  type: "bash";
  command: string;
}

export interface RpcExportHtml {
  type: "export_html";
  outputPath?: string;
}

export interface RpcSetAutoCompaction {
  type: "set_auto_compaction";
  enabled: boolean;
}

export interface RpcSetAutoRetry {
  type: "set_auto_retry";
  enabled: boolean;
}

export interface RpcAbortRetry {
  type: "abort_retry";
}

export interface RpcAbortBash {
  type: "abort_bash";
}

export type RpcCommand =
  | RpcPrompt
  | RpcSteer
  | RpcFollowUp
  | RpcAbort
  | RpcNewSession
  | RpcGetState
  | RpcGetMessages
  | RpcSetModel
  | RpcGetAvailableModels
  | RpcSetThinkingLevel
  | RpcCycleModel
  | RpcCycleThinkingLevel
  | RpcCompact
  | RpcGetSessionStats
  | RpcSwitchSession
  | RpcFork
  | RpcClone
  | RpcGetEntries
  | RpcGetTree
  | RpcSetSessionName
  | RpcGetCommands
  | RpcBash
  | RpcExportHtml
  | RpcSetAutoCompaction
  | RpcSetAutoRetry
  | RpcAbortRetry
  | RpcAbortBash;

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

// ── RPC Response (responses to commands) ──────────────────────────────────

export interface RpcResponseBase {
  type: "response";
  command: string;
  success: boolean;
  error?: string;
  data?: unknown;
}

export interface RpcResponseSuccess extends RpcResponseBase {
  success: true;
}

export interface RpcResponseError extends RpcResponseBase {
  success: false;
  error: string;
}

export type RpcResponse = RpcResponseSuccess | RpcResponseError;

// ── RPC Events (received from stdout) ─────────────────────────────────────

export interface AgentStartEvent {
  type: "agent_start";
}

export interface AgentEndEvent {
  type: "agent_end";
  messages?: unknown[];
  willRetry?: boolean;
}

export interface AgentSettledEvent {
  type: "agent_settled";
}

export interface TurnStartEvent {
  type: "turn_start";
}

export interface TurnEndEvent {
  type: "turn_end";
  message?: unknown;
  toolResults?: unknown[];
}

export interface MessageStartEvent {
  type: "message_start";
  message?: unknown;
}

export interface MessageEndEvent {
  type: "message_end";
  message?: unknown;
}

export interface MessageUpdateEvent {
  type: "message_update";
  message?: unknown;
  assistantMessageEvent: AssistantMessageEvent;
}

export type AssistantMessageEvent =
  | { type: "start" }
  | { type: "text_start"; contentIndex: number; partial?: unknown }
  | { type: "text_delta"; contentIndex: number; delta: string; partial?: unknown }
  | { type: "text_end"; contentIndex: number; content: string; partial?: unknown }
  | { type: "thinking_start"; contentIndex: number; partial?: unknown }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial?: unknown }
  | { type: "thinking_end"; contentIndex: number; content: string; partial?: unknown }
  | { type: "toolcall_start"; contentIndex: number; partial?: unknown }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial?: unknown }
  | { type: "toolcall_end"; contentIndex: number; toolCall: unknown; partial?: unknown }
  | { type: "done"; reason: "stop" | "length" | "toolUse" }
  | { type: "error"; reason: "aborted" | "error" };

export interface ToolExecutionStartEvent {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolExecutionUpdateEvent {
  type: "tool_execution_update";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  partialResult?: {
    content?: Array<{ type: string; text?: string }>;
    details?: { truncation?: unknown; fullOutputPath?: string | null };
  };
}

export interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
  };
  isError: boolean;
}

export interface QueueUpdateEvent {
  type: "queue_update";
  steering?: string[];
  followUp?: string[];
}

export interface CompactionStartEvent {
  type: "compaction_start";
  reason: "manual" | "threshold" | "overflow";
}

export interface CompactionEndEvent {
  type: "compaction_end";
  reason: "manual" | "threshold" | "overflow";
  result?: {
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    estimatedTokensAfter: number;
    details: unknown;
  } | null;
  aborted: boolean;
  willRetry?: boolean;
  errorMessage?: string;
}

export interface AutoRetryStartEvent {
  type: "auto_retry_start";
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
}

export interface AutoRetryEndEvent {
  type: "auto_retry_end";
  success: boolean;
  attempt: number;
  finalError?: string;
}

export interface ExtensionErrorEvent {
  type: "extension_error";
  extensionPath: string;
  event: string;
  error: string;
}

export interface ConnectedEvent {
  type: "connected";
  sessionId: string;
  cwd: string;
  timestamp: number;
}

export interface ExtensionUiRequest {
  type: "extension_ui_request";
  id: string;
  method: string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  timeout?: number;
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: string;
}

export type PiEvent =
  | ConnectedEvent
  | AgentStartEvent
  | AgentEndEvent
  | AgentSettledEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageEndEvent
  | MessageUpdateEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | QueueUpdateEvent
  | CompactionStartEvent
  | CompactionEndEvent
  | AutoRetryStartEvent
  | AutoRetryEndEvent
  | ExtensionErrorEvent
  | ExtensionUiRequest
  | RpcResponseSuccess
  | RpcResponseError;

// ── Extension UI Responses (sent to stdin in response to ExtensionUiRequest) ──

export interface ExtensionUiResponse {
  type: "extension_ui_response";
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
}

// ── Spawn options ─────────────────────────────────────────────────────────

export interface PiSpawnOptions {
  /** Working directory for the Pi process. Defaults to project root. */
  cwd?: string;
  /** If true, pass --no-session to disable session persistence. */
  noSession?: boolean;
  /** Allowlisted tool names (passed via --tools). If omitted, all default tools. */
  tools?: string[];
  /** Tool names to exclude (passed via --exclude-tools). */
  excludeTools?: string[];
  /** If true, pass --no-skills to disable all skills. */
  noSkills?: boolean;
  /** Skill names to enable. Takes precedence over noSkills. */
  skills?: string[];
  /** If true, pass --no-extensions to disable all extensions. */
  noExtensions?: boolean;
  /** Provider name. */
  provider?: string;
  /** Model pattern. */
  model?: string;
  /** Thinking level. */
  thinkingLevel?: ThinkingLevel;
  /** Enable session persistence. */
  persistSession?: boolean;
  /** Custom session file path. */
  sessionPath?: string;
}
