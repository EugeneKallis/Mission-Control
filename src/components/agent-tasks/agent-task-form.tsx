"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { buildCronExpression, parseCronToForm } from "@/lib/cron";
import type { AgentTaskRow, ResourceState, ToolInfo, SkillInfo } from "./agent-task-types";

interface Props {
  resources: ResourceState | null;
  initial: AgentTaskRow | null;
  onSubmit: (data: {
    name: string;
    prompt: string;
    cronExpression: string;
    enabled: boolean;
    provider?: string | null;
    model?: string | null;
    thinkingLevel?: string | null;
    enabledTools?: string[] | null;
    disabledTools?: string[] | null;
    enabledSkills?: string[] | null;
    noSkills?: boolean;
    appendSystem?: string | null;
    persistSession?: boolean;
    timeoutSec?: number;
  }) => void;
  onCancel: () => void;
}

// ── Cron shape helpers ────────────────────────────────────────────────────

type CronShape = "interval" | "daily" | "weekly";

const DEFAULT_INTERVAL = 30;
const DEFAULT_HOUR = "08";
const DEFAULT_MINUTE = "00";
const DEFAULT_DAY = "0";

interface CronFormValues {
  shape: CronShape;
  interval: number;
  hour: string;
  minute: string;
  dayOfWeek: string;
}

function defaultCronValues(existingCron?: string): CronFormValues {
  if (existingCron) {
    const parsed = parseCronToForm(existingCron);
    if (parsed) {
      const shape: CronShape = "interval" in parsed && parsed.interval
        ? "interval"
        : "dayOfWeek" in parsed && parsed.dayOfWeek !== undefined
          ? "weekly"
          : "daily";
      return {
        shape,
        interval: "interval" in parsed ? (parsed.interval ?? DEFAULT_INTERVAL) : DEFAULT_INTERVAL,
        hour: "hour" in parsed ? (parsed.hour ?? DEFAULT_HOUR) : DEFAULT_HOUR,
        minute: "minute" in parsed ? (parsed.minute ?? DEFAULT_MINUTE) : DEFAULT_MINUTE,
        dayOfWeek: "dayOfWeek" in parsed ? (parsed.dayOfWeek ?? DEFAULT_DAY) : DEFAULT_DAY,
      };
    }
  }
  return { shape: "interval", interval: DEFAULT_INTERVAL, hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE, dayOfWeek: DEFAULT_DAY };
}

// ── Thinking levels ───────────────────────────────────────────────────────

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

// ── Component ─────────────────────────────────────────────────────────────

export function AgentTaskForm({ resources, initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [cronValues, setCronValues] = useState<CronFormValues>(
    defaultCronValues(initial?.cronExpression),
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [thinkingLevel, setThinkingLevel] = useState(initial?.thinkingLevel ?? "off");
  const [appendSystem, setAppendSystem] = useState(initial?.appendSystem ?? "");
  const [persistSession, setPersistSession] = useState(initial?.persistSession ?? false);
  const [timeoutSec, setTimeoutSec] = useState(initial?.timeoutSec ?? 300);

  // Parse stored JSON arrays
  const storedEnabledTools: string[] = initial?.enabledTools
    ? (JSON.parse(initial.enabledTools) as string[])
    : [];
  const storedDisabledTools: string[] = initial?.disabledTools
    ? (JSON.parse(initial.disabledTools) as string[])
    : [];
  const storedEnabledSkills: string[] = initial?.enabledSkills
    ? (JSON.parse(initial.enabledSkills) as string[])
    : [];
  const storedNoSkills = initial?.noSkills ?? false;

  const [selectedEnabledTools, setSelectedEnabledTools] = useState<Set<string>>(
    new Set(storedEnabledTools),
  );
  const [selectedDisabledTools, setSelectedDisabledTools] = useState<Set<string>>(
    new Set(storedDisabledTools),
  );
  const [selectedEnabledSkills, setSelectedEnabledSkills] = useState<Set<string>>(
    new Set(storedEnabledSkills),
  );
  const [noSkills, setNoSkills] = useState(storedNoSkills);

  // ── Build cron expression from form values ────────────────────────
  function buildCron(): string {
    return buildCronExpression({
      ...cronValues,
      interval: cronValues.interval,
    } as Parameters<typeof buildCronExpression>[0]);
  }

  // ── Submit ─────────────────────────────────────────────────────────
  function handleSubmit() {
    onSubmit({
      name,
      prompt,
      cronExpression: buildCron(),
      enabled: initial?.enabled ?? enabled,
      provider: provider || null,
      model: model || null,
      thinkingLevel: thinkingLevel || null,
      enabledTools: selectedEnabledTools.size > 0 ? [...selectedEnabledTools] : null,
      disabledTools: selectedDisabledTools.size > 0 ? [...selectedDisabledTools] : null,
      enabledSkills: selectedEnabledSkills.size > 0 ? [...selectedEnabledSkills] : null,
      noSkills,
      appendSystem: appendSystem || null,
      persistSession,
      timeoutSec,
    });
  }

  const dangerousToolNames = resources?.tools
    ?.filter((t) => t.dangerous)
    .map((t) => t.name) ?? [];

  function isToolSelectedForTask(toolName: string): boolean {
    // If the tool is in selectedDisabledTools, it's explicitly disabled
    if (selectedDisabledTools.has(toolName)) return false;
    // If selectedEnabledTools is set, only those are enabled
    if (selectedEnabledTools.size > 0) return selectedEnabledTools.has(toolName);
    // If neither is set, all tools are enabled by default
    return true;
  }

  function toggleTool(toolName: string) {
    // If it's currently enabled, disable it
    if (isToolSelectedForTask(toolName)) {
      setSelectedDisabledTools((prev) => new Set(prev).add(toolName));
      setSelectedEnabledTools((prev) => {
        const next = new Set(prev);
        next.delete(toolName);
        return next;
      });
    } else {
      // Enable it
      setSelectedDisabledTools((prev) => {
        const next = new Set(prev);
        next.delete(toolName);
        return next;
      });
      setSelectedEnabledTools((prev) => new Set(prev).add(toolName));
    }
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#131313", border: "1px solid rgba(59, 75, 63, 0.3)" }}
    >
      <div className="p-4 space-y-4">
        <h2 className="text-lg font-bold text-[#E5E2E1]">
          {initial ? "Edit Task" : "New Task"}
        </h2>

        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-[#849587] mb-1">Name</label>
          <input
            className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Scheduled Task"
          />
        </div>

        {/* Prompt */}
        <div>
          <label className="block text-xs font-semibold text-[#849587] mb-1">Prompt</label>
          <textarea
            className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B] resize-y min-h-[80px] font-mono"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should the agent do?"
            rows={4}
          />
        </div>

        {/* Frequency (Cron) */}
        <div>
          <label className="block text-xs font-semibold text-[#849587] mb-1">Frequency</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={cronValues.shape}
              onChange={(e) => setCronValues((p) => ({ ...p, shape: e.target.value as CronShape }))}
            >
              <option value="interval">Every N minutes</option>
              <option value="daily">Daily at</option>
              <option value="weekly">Weekly on</option>
            </select>

            {cronValues.shape === "interval" && (
              <>
                <span className="text-xs text-[#849587]">Every</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  className="w-20 bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={cronValues.interval}
                  onChange={(e) => setCronValues((p) => ({ ...p, interval: parseInt(e.target.value) || 30 }))}
                />
                <span className="text-xs text-[#849587]">min</span>
              </>
            )}

            {cronValues.shape === "daily" && (
              <>
                <input
                  type="time"
                  className="bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={`${cronValues.hour.padStart(2, "0")}:${cronValues.minute.padStart(2, "0")}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":");
                    setCronValues((p) => ({ ...p, hour: h ?? "08", minute: m ?? "00" }));
                  }}
                />
              </>
            )}

            {cronValues.shape === "weekly" && (
              <>
                <select
                  className="bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={cronValues.dayOfWeek}
                  onChange={(e) => setCronValues((p) => ({ ...p, dayOfWeek: e.target.value }))}
                >
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </select>
                <span className="text-xs text-[#849587]">at</span>
                <input
                  type="time"
                  className="bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={`${cronValues.hour.padStart(2, "0")}:${cronValues.minute.padStart(2, "0")}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":");
                    setCronValues((p) => ({ ...p, hour: h ?? "08", minute: m ?? "00" }));
                  }}
                />
              </>
            )}

            <span className="text-xs text-[#618B6B] font-mono">{buildCron()}</span>
          </div>
        </div>

        {/* Model / Provider / Thinking */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-[#849587] mb-1">Provider</label>
            <input
              className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="anthropic"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-[#849587] mb-1">Model</label>
            <input
              className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-sonnet-4"
            />
          </div>
          <div className="w-[130px]">
            <label className="block text-xs font-semibold text-[#849587] mb-1">Thinking</label>
            <select
              className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value)}
            >
              {THINKING_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="w-[100px]">
            <label className="block text-xs font-semibold text-[#849587] mb-1">Timeout (s)</label>
            <input
              type="number"
              min={1}
              max={3600}
              className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(parseInt(e.target.value) || 300)}
            />
          </div>
        </div>

        {/* Tools */}
        {resources?.tools && (
          <div>
            <label className="block text-xs font-semibold text-[#849587] mb-1">Tools</label>
            <div className="flex flex-wrap gap-2">
              {resources.tools.map((tool) => {
                const enabled = isToolSelectedForTask(tool.name);
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => toggleTool(tool.name)}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded transition-colors"
                    style={{
                      background: enabled ? "#1A3A2A" : "#201F1F",
                      color: enabled ? "#618B6B" : "#849587",
                      border: `1px solid ${enabled ? "rgba(97, 139, 107, 0.4)" : "rgba(59, 75, 63, 0.3)"}`,
                    }}
                    title={tool.description || tool.name}
                  >
                    {tool.label ?? tool.name}
                    {tool.dangerous && enabled && (
                      <span className="ml-1 text-[#FFB4AB]" title="Dangerous tool">⚠</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Skills */}
        {resources?.skills && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs font-semibold text-[#849587]">Skills</label>
              <label className="flex items-center gap-1 text-xs text-[#849587] cursor-pointer">
                <input
                  type="checkbox"
                  checked={noSkills}
                  onChange={(e) => setNoSkills(e.target.checked)}
                  className="accent-[#618B6B]"
                />
                Disable all
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {resources.skills.map((skill) => {
                const enabled = !noSkills && selectedEnabledSkills.has(skill.name);
                return (
                  <button
                    key={skill.name}
                    type="button"
                    disabled={noSkills}
                    onClick={() => {
                      setSelectedEnabledSkills((prev) => {
                        const next = new Set(prev);
                        if (next.has(skill.name)) next.delete(skill.name);
                        else next.add(skill.name);
                        return next;
                      });
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded transition-colors disabled:opacity-30"
                    style={{
                      background: enabled ? "#1A3A2A" : "#201F1F",
                      color: enabled ? "#618B6B" : "#849587",
                      border: `1px solid ${enabled ? "rgba(97, 139, 107, 0.4)" : "rgba(59, 75, 63, 0.3)"}`,
                    }}
                  >
                    {skill.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Extra settings */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-[#849587] cursor-pointer">
            <input
              type="checkbox"
              checked={persistSession}
              onChange={(e) => setPersistSession(e.target.checked)}
              className="accent-[#618B6B]"
            />
            Persist session (enables memory across runs)
          </label>
        </div>

        {/* Append system prompt */}
        <div>
          <label className="block text-xs font-semibold text-[#849587] mb-1">
            Append to System Prompt <span className="font-normal text-[#5A6B5E]">(optional)</span>
          </label>
          <textarea
            className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-3 py-2 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B] resize-y min-h-[50px] font-mono"
            value={appendSystem}
            onChange={(e) => setAppendSystem(e.target.value)}
            placeholder="Additional instructions for the agent…"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !prompt.trim()}
          >
            {initial ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
