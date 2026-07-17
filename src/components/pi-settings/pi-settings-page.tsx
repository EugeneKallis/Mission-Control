"use client";

import { useState, useEffect } from "react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useToast } from "@/components/toast-provider";

interface ToolInfo {
  name: string;
  label: string;
  description: string;
  dangerous: boolean;
  required: boolean;
  enabled: boolean;
}

interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  source: string;
  enabled: boolean;
}

interface ResourceState {
  tools: ToolInfo[];
  skills: SkillInfo[];
}

async function fetchState(): Promise<ResourceState> {
  const res = await fetch("/api/pi/resources");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ResourceState>;
}

export function PiSettingsPage() {
  const [state, setState] = useState<ResourceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toolFilter, setToolFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [skillFilter, setSkillFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [toolSearch, setToolSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const toast = useToast();

  useEffect(() => {
    fetchState()
      .then(setState)
      .catch((e) => toast.showToast(`Failed to load Pi resources: ${e.message}`, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  async function toggleTool(name: string) {
    // Optimistic update
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tools: prev.tools.map((t) =>
          t.name === name ? { ...t, enabled: !t.enabled } : t,
        ),
      };
    });

    try {
      // Call the toggle endpoint — we use the existing DB abstraction
      const res = await fetch("/api/pi/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "toggle", type: "tool", name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Revert on failure
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tools: prev.tools.map((t) =>
            t.name === name ? { ...t, enabled: !t.enabled } : t,
          ),
        };
      });
      toast.showToast(`Failed to toggle tool: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  async function toggleSkill(name: string) {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        skills: prev.skills.map((s) =>
          s.name === name ? { ...s, enabled: !s.enabled } : s,
        ),
      };
    });

    try {
      const res = await fetch("/api/pi/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "toggle", type: "skill", name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          skills: prev.skills.map((s) =>
            s.name === name ? { ...s, enabled: !s.enabled } : s,
          ),
        };
      });
      toast.showToast(`Failed to toggle skill: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  const filteredTools = (state?.tools ?? [])
    .filter((t) => {
      if (toolFilter === "enabled" && !t.enabled) return false;
      if (toolFilter === "disabled" && t.enabled) return false;
      if (toolSearch && !t.name.toLowerCase().includes(toolSearch.toLowerCase()) &&
          !t.label.toLowerCase().includes(toolSearch.toLowerCase())) return false;
      return true;
    });

  const filteredSkills = (state?.skills ?? [])
    .filter((s) => {
      if (skillFilter === "enabled" && !s.enabled) return false;
      if (skillFilter === "disabled" && s.enabled) return false;
      if (skillSearch && !s.name.toLowerCase().includes(skillSearch.toLowerCase()) &&
          !s.description.toLowerCase().includes(skillSearch.toLowerCase())) return false;
      return true;
    });

  const enabledToolCount = state?.tools.filter((t) => t.enabled).length ?? 0;
  const enabledSkillCount = state?.skills.filter((s) => s.enabled).length ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
          <p className="text-sm">Loading Pi resources…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-2xl text-primary">settings</span>
        <div>
          <h1 className="text-xl font-display font-semibold text-on-surface">Pi Settings</h1>
          <p className="text-sm text-on-surface-variant/70 mt-0.5">
            Control which tools and skills are available to Pi sessions.
            Changes apply to new sessions only.
          </p>
        </div>
      </div>

      {/* ── Tools section ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-primary">build</span>
            <h2 className="text-base font-semibold text-on-surface">Tools</h2>
            <span className="text-xs text-on-surface-variant/60 px-2 py-0.5 bg-surface-container-high">
              {enabledToolCount} / {state?.tools.length ?? 0} enabled
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search tools…"
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            className="flex-1 bg-surface-container-high text-sm text-on-surface px-3 py-2 outline-none border border-outline-variant/30 focus:border-primary/50 max-w-sm"
            aria-label="Search tools"
          />
          <div className="flex gap-1">
            {(["all", "enabled", "disabled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setToolFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  toolFilter === f
                    ? "bg-primary/20 text-primary"
                    : "text-on-surface-variant hover:text-on-surface bg-surface-container-high"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {filteredTools.length === 0 ? (
            <div className="text-sm text-on-surface-variant/50 py-6 text-center">No tools match your filter.</div>
          ) : (
            filteredTools.map((tool) => (
              <div
                key={tool.name}
                className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                  tool.enabled
                    ? "bg-surface"
                    : "bg-surface-container-low opacity-60"
                } border border-outline-variant/20`}
              >
                <ToggleSwitch
                  enabled={tool.enabled}
                  onChange={() => toggleTool(tool.name)}
                  label={`Toggle ${tool.label}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-on-surface">{tool.label}</span>
                    {tool.dangerous && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-warning/15 text-warning font-medium">
                        DANGEROUS
                      </span>
                    )}
                    <code className="text-[11px] px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant font-mono">
                      {tool.name}
                    </code>
                  </div>
                  <p className="text-xs text-on-surface-variant/70 mt-0.5">{tool.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Skills section ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-primary">auto_awesome</span>
            <h2 className="text-base font-semibold text-on-surface">Skills</h2>
            <span className="text-xs text-on-surface-variant/60 px-2 py-0.5 bg-surface-container-high">
              {enabledSkillCount} / {state?.skills.length ?? 0} enabled
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search skills…"
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            className="flex-1 bg-surface-container-high text-sm text-on-surface px-3 py-2 outline-none border border-outline-variant/30 focus:border-primary/50 max-w-sm"
            aria-label="Search skills"
          />
          <div className="flex gap-1">
            {(["all", "enabled", "disabled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSkillFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  skillFilter === f
                    ? "bg-primary/20 text-primary"
                    : "text-on-surface-variant hover:text-on-surface bg-surface-container-high"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {filteredSkills.length === 0 ? (
            <div className="text-sm text-on-surface-variant/50 py-6 text-center">No skills match your filter.</div>
          ) : (
            filteredSkills.map((skill) => (
              <div
                key={skill.name}
                className={`flex items-start gap-4 px-4 py-3 transition-colors ${
                  skill.enabled
                    ? "bg-surface"
                    : "bg-surface-container-low opacity-60"
                } border border-outline-variant/20`}
              >
                <ToggleSwitch
                  enabled={skill.enabled}
                  onChange={() => toggleSkill(skill.name)}
                  label={`Toggle ${skill.name}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-on-surface">{skill.name}</span>
                    {skill.source !== "user" && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant/60">
                        {skill.source}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant/70 mt-0.5 line-clamp-2">{skill.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
