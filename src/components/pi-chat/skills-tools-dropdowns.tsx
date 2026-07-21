/**
 * Interactive dropdowns showing enabled/disabled skills and tools
 * for the current Pi session. Each row is a toggle — clicking flips
 * the tool/skill's enabled state and restarts the Pi singleton so the
 * change applies to the current chat on the next message.
 *
 * Why a restart: pi v0.81.1 has no live RPC command to toggle
 * tools/skills (only set_model / set_thinking_level). Tool/skill
 * selection is spawn-time-only via --exclude-tools / --skill /
 * --no-skills. The restart re-spawns with fresh flags; conversation
 * persists via --session.
 *
 * Populated from /api/pi/resources (GET) and toggled via POST.
 */

"use client";

import { useState, useEffect, useCallback } from "react";

interface ToolEntry {
  name: string;
  label: string;
  enabled: boolean;
  dangerous: boolean;
}

interface SkillEntry {
  name: string;
  description: string;
  enabled: boolean;
}

interface Resources {
  tools: ToolEntry[];
  skills: SkillEntry[];
}

export function SkillsToolsDropdowns() {
  const [resources, setResources] = useState<Resources | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch("/api/pi/resources");
      const data = (await res.json()) as Resources;
      setResources(data);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  const toggle = useCallback(
    async (type: "tool" | "skill", name: string) => {
      const key = `${type}:${name}`;
      if (pending === key) return;
      setPending(key);
      setError(null);

      // Optimistic flip for snappy UI.
      setResources((prev) => {
        if (!prev) return prev;
        if (type === "tool") {
          return {
            ...prev,
            tools: prev.tools.map((t) =>
              t.name === name ? { ...t, enabled: !t.enabled } : t,
            ),
          };
        }
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle", type, name }),
        });
        const data = (await res.json()) as { ok?: boolean; state?: Resources; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `Toggle failed (${res.status})`);
        }
        // Server restarts the pi singleton; apply the authoritative state.
        if (data.state) setResources(data.state);
        else void fetchResources();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Toggle failed");
        // Revert optimistic flip on failure.
        void fetchResources();
      } finally {
        setPending(null);
      }
    },
    [pending, fetchResources],
  );

  if (!resources) return null;

  const enabledTools = resources.tools.filter((t) => t.enabled);
  const enabledSkills = resources.skills.filter((s) => s.enabled);

  return (
    <div className="flex items-center gap-2">
      {/* Tools dropdown */}
      <div className="relative">
        <button
          onClick={() => { setToolsOpen(!toolsOpen); setSkillsOpen(false); }}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high transition-colors"
          title="Enabled tools (toggle to apply to current chat)"
        >
          <span className="material-symbols-outlined text-sm">build</span>
          {enabledTools.length}/{resources.tools.length} tools
        </button>

        {toolsOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setToolsOpen(false)}
            />
            <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-outline-variant/30 shadow-xl min-w-[220px] max-h-[min(70vh,400px)] overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 border-b border-outline-variant/20">
                Tools · click to toggle
              </div>
              {resources.tools.map((tool) => {
                const key = `tool:${tool.name}`;
                const isPending = pending === key;
                return (
                  <button
                    key={tool.name}
                    onClick={() => toggle("tool", tool.name)}
                    disabled={isPending}
                    title={tool.enabled ? "Disable on next message" : "Enable on next message"}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors disabled:opacity-50 ${
                      tool.enabled
                        ? "text-on-surface hover:bg-surface-container-high"
                        : "text-on-surface-variant/40 hover:bg-surface-container-high/50"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-sm ${
                        tool.enabled ? "text-primary" : "text-on-surface-variant/30"
                      }`}
                    >
                      {isPending ? "progress_activity" : tool.enabled ? "check_circle" : "cancel"}
                    </span>
                    <span className="flex-1">{tool.label}</span>
                    {tool.dangerous && tool.enabled && (
                      <span className="text-[9px] px-1 bg-warning/15 text-warning">!</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Skills dropdown — shown whenever any skills exist (not just enabled) */}
      {resources.skills.length > 0 && (
        <div className="relative">
          <button
            onClick={() => { setSkillsOpen(!skillsOpen); setToolsOpen(false); }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high transition-colors"
            title="Enabled skills (toggle to apply to current chat)"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            {enabledSkills.length}/{resources.skills.length} skills
          </button>

          {skillsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSkillsOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-outline-variant/30 shadow-xl min-w-[240px] max-h-[min(70vh,400px)] overflow-y-auto">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 border-b border-outline-variant/20">
                  Skills · click to toggle
                </div>
                {resources.skills.map((skill) => {
                  const key = `skill:${skill.name}`;
                  const isPending = pending === key;
                  return (
                    <button
                      key={skill.name}
                      onClick={() => toggle("skill", skill.name)}
                      disabled={isPending}
                      title={skill.enabled ? "Disable on next message" : "Enable on next message"}
                      className={`w-full px-3 py-1.5 text-xs text-left transition-colors disabled:opacity-50 ${
                        skill.enabled
                          ? "text-on-surface hover:bg-surface-container-high"
                          : "text-on-surface-variant/40 hover:bg-surface-container-high/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`material-symbols-outlined text-sm ${
                            skill.enabled ? "text-primary" : "text-on-surface-variant/30"
                          }`}
                        >
                          {isPending ? "progress_activity" : skill.enabled ? "check_circle" : "cancel"}
                        </span>
                        <span className="font-medium">{skill.name}</span>
                      </div>
                      {skill.description && (
                        <div className="text-[10px] text-on-surface-variant/60 ml-7 mt-0.5 line-clamp-2">
                          {skill.description}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <span className="text-[10px] text-warning/80" title={error}>
          toggle error
        </span>
      )}
    </div>
  );
}