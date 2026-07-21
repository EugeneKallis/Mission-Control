"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildCronExpression,
  parseCronToForm,
  type Frequency,
  type IntervalUnit,
  type DayOfWeek,
  DEFAULT_FORM,
} from "@/lib/cron";
import type { AgentTaskRow, ResourceState, ToolInfo, SkillInfo } from "./agent-task-types";
import { usePiModels, type PiModelEntry } from "@/hooks/use-pi-models";

interface Props {
  resources: ResourceState | null;
  initial: AgentTaskRow | null;
  onSubmit: (data: Partial<AgentTaskRow> & { cronExpression: string; prompt: string; name: string }) => void;
  onCancel: () => void;
}

// ── Cron form: reuses ScheduleFormValues from src/lib/cron ─────────────

// ── Thinking levels ───────────────────────────────────────────────────────

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

// ── Component ─────────────────────────────────────────────────────────────

export function AgentTaskForm({ resources, initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const parsedCron = initial?.cronExpression ? parseCronToForm(initial.cronExpression) : DEFAULT_FORM;
  const [frequency, setFrequency] = useState<Frequency>(parsedCron.frequency);
  const [intervalValue, setIntervalValue] = useState(parsedCron.intervalValue ?? "5");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(parsedCron.intervalUnit ?? "minutes");
  const [time, setTime] = useState(parsedCron.time ?? "09:00");
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(parsedCron.dayOfWeek ?? "1");
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [thinkingLevel, setThinkingLevel] = useState(initial?.thinkingLevel ?? "off");
  const [appendSystem, setAppendSystem] = useState(initial?.appendSystem ?? "");
  const [persistSession, setPersistSession] = useState(initial?.persistSession ?? false);
  const [timeoutSec, setTimeoutSec] = useState(initial?.timeoutSec ?? 300);

  // ── Phase 2: Pi model registry for cascading Provider/Model dropdowns ───────
  const { models, loading: modelsLoading, error: modelsError } = usePiModels();

  // Three render modes for the Provider/Model controls:
  //  - showSelects  : models loaded successfully → active cascading dropdowns
  //  - showLoading  : fetch in flight → disabled dropdowns with "Loading\u2026"
  //  - showFallback : error or empty registry → original plain text inputs
  const showSelects = !modelsLoading && !modelsError && models.length > 0;
  const showLoading = modelsLoading && !modelsError;
  const showFallback = !showSelects && !showLoading;

  // Unique providers from Pi's model list (provider value → display label)
  const providers = new Map<string, string>();
  for (const m of models) {
    if (!providers.has(m.provider)) providers.set(m.provider, m.providerLabel ?? m.provider);
  }

  // Model list filtered to the selected provider (all when provider === "")
  const visibleModels: PiModelEntry[] =
    provider === "" ? models : models.filter((m) => m.provider === provider);

  function handleProviderChange(newProvider: string) {
    setProvider(newProvider);
    // When switching to a specific provider, reset the model if it doesn't belong to the new provider
    if (newProvider !== "" && model !== "") {
      const hasModel = models.some((m) => m.provider === newProvider && m.id === model);
      if (!hasModel) setModel("");
    }
  }

  function handleModelChange(value: string) {
    if (value === "") {
      setModel("");
      return;
    }
    // Prefer the model matching the currently-selected provider (disambiguates
    // duplicate IDs across providers — e.g. `deepseek-v4-flash` under both
    // `deepseek` and `opencode-go`). Falls back to the first match if none.
    const m =
      models.find((mm) => mm.id === value && (provider === "" || mm.provider === provider)) ??
      models.find((mm) => mm.id === value);
    if (m) {
      setModel(m.id);
      setProvider(m.provider);
    } else {
      setModel(value);
    }
  }

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
    try {
      return buildCronExpression({ frequency, intervalValue, intervalUnit, time, dayOfWeek });
    } catch {
      return "*/5 * * * *";
    }
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
      enabledTools: selectedEnabledTools.size > 0 ? JSON.stringify([...selectedEnabledTools]) : null,
      disabledTools: selectedDisabledTools.size > 0 ? JSON.stringify([...selectedDisabledTools]) : null,
      enabledSkills: selectedEnabledSkills.size > 0 ? JSON.stringify([...selectedEnabledSkills]) : null,
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
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              <option value="interval">Every N minutes</option>
              <option value="daily">Daily at</option>
              <option value="weekly">Weekly on</option>
            </select>

            {frequency === "interval" && (
              <>
                <span className="text-xs text-[#849587]">Every</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  className="w-20 bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(e.target.value || "5")}
                />
                <select
                  className="bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                >
                  <option value="minutes">min</option>
                  <option value="hours">hr</option>
                </select>
              </>
            )}

            {frequency === "daily" && (
              <>
                <input
                  type="time"
                  className="bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </>
            )}

            {frequency === "weekly" && (
              <>
                <select
                  className="bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
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
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
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
            {showFallback ? (
              <input
                data-testid="task-provider"
                className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="anthropic"
              />
            ) : (
              <select
                data-testid="task-provider"
                className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                value={provider}
                disabled={showLoading}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {showLoading ? (
                  <option value="">Loading…</option>
                ) : (
                  <>
                    <option value="">Default</option>
                    {[...providers.entries()].map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </>
                )}
              </select>
            )}
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-[#849587] mb-1">Model</label>
            {showFallback ? (
              <input
                data-testid="task-model"
                className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="claude-sonnet-4"
              />
            ) : (
              <select
                data-testid="task-model"
                className="w-full bg-[#0E0E0E] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                value={model}
                disabled={showLoading}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {showLoading ? (
                  <option value="">Loading…</option>
                ) : (
                  <>
                    <option value="">Default</option>
                    {visibleModels.map((m) => (
                      <option key={`${m.provider}/${m.id}`} value={m.id}>
                        {m.name}{m.configured === false ? " (needs key)" : ""}
                      </option>
                    ))}
                  </>
                )}
              </select>
            )}
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
