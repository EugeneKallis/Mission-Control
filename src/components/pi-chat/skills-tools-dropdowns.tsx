/**
 * Read-only dropdowns showing enabled/disabled skills and tools
 * for the current Pi session. Displayed in the chat header for
 * visibility — "what does this session have access to?"
 *
 * Populated from the Phase 2 Pi resources API (/api/pi/resources).
 */

"use client";

import { useState, useEffect } from "react";

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

  useEffect(() => {
    fetch("/api/pi/resources")
      .then((r) => r.json())
      .then((data: Resources) => setResources(data))
      .catch(() => {
        /* non-fatal */
      });
  }, []);

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
          title="Enabled tools"
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
            <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-outline-variant/30 shadow-xl min-w-[200px] max-h-64 overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 border-b border-outline-variant/20">
                Tools
              </div>
              {resources.tools.map((tool) => (
                <div
                  key={tool.name}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                    tool.enabled
                      ? "text-on-surface"
                      : "text-on-surface-variant/40"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-sm ${
                      tool.enabled ? "text-primary" : "text-on-surface-variant/30"
                    }`}
                  >
                    {tool.enabled ? "check_circle" : "cancel"}
                  </span>
                  <span className="flex-1">{tool.label}</span>
                  {tool.dangerous && tool.enabled && (
                    <span className="text-[9px] px-1 bg-warning/15 text-warning">!</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Skills dropdown */}
      {enabledSkills.length > 0 && (
        <div className="relative">
          <button
            onClick={() => { setSkillsOpen(!skillsOpen); setToolsOpen(false); }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high transition-colors"
            title="Enabled skills"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            {enabledSkills.length} skills
          </button>

          {skillsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSkillsOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-outline-variant/30 shadow-xl min-w-[220px] max-h-64 overflow-y-auto">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 border-b border-outline-variant/20">
                  Skills
                </div>
                {resources.skills.map((skill) => (
                  <div
                    key={skill.name}
                    className={`px-3 py-1.5 text-xs ${
                      skill.enabled
                        ? "text-on-surface"
                        : "text-on-surface-variant/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`material-symbols-outlined text-sm ${
                          skill.enabled ? "text-primary" : "text-on-surface-variant/30"
                        }`}
                      >
                        {skill.enabled ? "check_circle" : "cancel"}
                      </span>
                      <span className="font-medium">{skill.name}</span>
                    </div>
                    {skill.enabled && skill.description && (
                      <div className="text-[10px] text-on-surface-variant/60 ml-7 mt-0.5 line-clamp-2">
                        {skill.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
