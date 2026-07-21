/**
 * Shared types for the Scheduled Agent Tasks UI.
 */

export interface AgentTaskRow {
  id: number;
  name: string;
  prompt: string;
  cronExpression: string;
  enabled: boolean;
  provider: string | null;
  model: string | null;
  thinkingLevel: string | null;
  enabledTools: string | null;    // JSON string[] or null
  disabledTools: string | null;   // JSON string[] or null
  enabledSkills: string | null;   // JSON string[] or null
  noSkills: boolean;
  appendSystem: string | null;
  persistSession: boolean;
  timeoutSec: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string | null;
}

export interface HistoryRun {
  id: number;
  startTime: string;
  endTime: string | null;
  status: string;
  output: string | null;
  triggeredBy: string | null;
}

export interface ToolInfo {
  name: string;
  label: string;
  description: string;
  dangerous: boolean;
  required: boolean;
}

export interface SkillInfo {
  name: string;
  description: string;
  source: string;
}

export interface ResourceState {
  tools: ToolInfo[];
  skills: SkillInfo[];
}
