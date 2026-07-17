/**
 * Slash-autocomplete dropdown for the Pi chat input.
 *
 * When the user types `/` at the start of the input (or after whitespace),
 * show a filtered dropdown of available skills (`/skill:name`), prompt
 * templates (`/templatename`), and built-in commands (`/new`, `/clear`).
 *
 * Built-in commands are dispatched by the parent (e.g. `/new` clears Pi's
 * context); skills/templates are inserted into the input as text.
 *
 * Design: lightweight, keyboard-navigable, click-to-select.
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { KeyboardEvent } from "react";

export interface SlashCommand {
  /** Full text to insert, e.g. "/skill:code-review" or "/deploy" */
  value: string;
  /** Display label in the dropdown. */
  label: string;
  /** Short description. */
  description: string;
  /** Category icon/type. */
  type: "skill" | "template" | "command";
  /** For built-in commands: the identifier the parent uses to dispatch. */
  commandId?: "new" | "clear";
}

interface SlashAutocompleteProps {
  /** Current input text value. */
  value: string;
  /**
   * Called when the user selects a command. For "skill" / "template" types,
   * the full insertion string (e.g. "/skill:foo ") is passed and the parent
   * typically sets it as the input text. For "command" types, the full
   * SlashCommand object is passed so the parent can dispatch built-in actions.
   */
  onSelect: (command: string | SlashCommand) => void;
  /** Whether the dropdown is visible. */
  open: boolean;
  /** Position style for the dropdown (absolute coordinates). */
  style?: React.CSSProperties;
  /** Index of the currently highlighted item (controlled). */
  activeIndex: number;
  /** Filtered list of commands to display. */
  filtered: SlashCommand[];
  /** Ref to the dropdown container for scroll-into-view. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function SlashAutocomplete({
  value,
  onSelect,
  open,
  style,
  activeIndex,
  filtered,
  containerRef,
}: SlashAutocompleteProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const ref = containerRef ?? internalContainerRef;

  const handleSelect = useCallback(
    (cmd: SlashCommand) => {
      // Built-in commands: pass the full object so the parent can dispatch
      if (cmd.type === "command") {
        onSelect(cmd);
        return;
      }
      // Skills / templates: insert the text into the input
      const slashIdx = value.lastIndexOf("/");
      const before = value.slice(0, slashIdx);
      onSelect(before + cmd.value + " ");
    },
    [value, onSelect],
  );

  // Scroll the active item into view when activeIndex changes
  useEffect(() => {
    if (!open) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, ref]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-surface border border-outline-variant/30 shadow-xl max-h-48 overflow-y-auto"
      style={style}
    >
      {filtered.map((cmd, i) => {
        const isActive = i === activeIndex || i === hoverIndex;
        const icon =
          cmd.type === "skill"
            ? "auto_awesome"
            : cmd.type === "command"
              ? cmd.commandId === "new"
                ? "add_circle"
                : "cleaning_services"
              : "description";
        return (
          <button
            key={cmd.value}
            data-idx={i}
            onClick={() => handleSelect(cmd)}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
            className={`w-full text-left flex items-start gap-3 px-3 py-2 transition-colors ${
              isActive
                ? "bg-surface-container-high text-on-surface"
                : "text-on-surface-variant hover:bg-surface-container-high/60"
            }`}
          >
            <span className="material-symbols-outlined text-base mt-0.5 shrink-0">
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{cmd.label}</div>
              <div className="text-[11px] text-on-surface-variant/70 line-clamp-1">
                {cmd.description}
              </div>
            </div>
            <code className="text-[10px] text-on-surface-variant/50 font-mono shrink-0 mt-0.5">
              /{cmd.type === "skill" ? `skill:${cmd.label}` : cmd.label}
            </code>
          </button>
        );
      })}
      {filtered.length === 0 && value.startsWith("/") && (
        <div className="px-3 py-3 text-xs text-on-surface-variant/50 text-center">
          No matching commands
        </div>
      )}
    </div>
  );
}

/**
 * Hook for managing slash-autocomplete in a textarea.
 * Returns props to spread onto SlashAutocomplete and helpers for
 * keyboard navigation.
 */
export function useSlashAutocomplete(
  inputValue: string,
  onInsert: (text: string | SlashCommand) => void,
) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filtered, setFiltered] = useState<SlashCommand[]>([]);
  const slashTriggerRef = useRef(false);

  // Show autocomplete when user types `/` after whitespace or at start
  useEffect(() => {
    if (!inputValue) {
      setShowAutocomplete(false);
      slashTriggerRef.current = false;
      return;
    }

    // Check if the last token starts with `/`
    const lastChar = inputValue[inputValue.length - 1];
    const tokens = inputValue.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];

    if (lastToken.startsWith("/") && lastToken.length > 0) {
      setShowAutocomplete(true);
      slashTriggerRef.current = true;
    } else if (lastChar === " " && slashTriggerRef.current) {
      // User committed to a selection or typed a space after slash
      setShowAutocomplete(false);
      slashTriggerRef.current = false;
    } else if (!lastToken.startsWith("/")) {
      setShowAutocomplete(false);
    }
  }, [inputValue]);

  // Built-in commands (always shown, not from the resources API)
  const BUILTIN_COMMANDS: SlashCommand[] = [
    {
      value: "/new",
      label: "new",
      description: "Start a fresh Pi session and clear the context",
      type: "command",
      commandId: "new",
    },
    {
      value: "/clear",
      label: "clear",
      description: "Clear the on-screen messages (keeps Pi context)",
      type: "command",
      commandId: "clear",
    },
  ];

  // Load available commands from the Pi resources API
  const [commands, setCommands] = useState<SlashCommand[]>(BUILTIN_COMMANDS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded) return;
    fetch("/api/pi/resources")
      .then((r) => r.json())
      .then((data: { skills: Array<{ name: string; description: string; enabled: boolean }> }) => {
        const cmds: SlashCommand[] = [...BUILTIN_COMMANDS];
        for (const skill of data.skills) {
          if (!skill.enabled) continue;
          cmds.push({
            value: `/skill:${skill.name}`,
            label: skill.name,
            description: skill.description,
            type: "skill",
          });
        }
        setCommands(cmds);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [loaded]);

  // Filter based on current input
  useEffect(() => {
    if (!showAutocomplete || !inputValue) {
      setFiltered([]);
      setActiveIndex(0);
      return;
    }

    const slashIdx = inputValue.lastIndexOf("/");
    if (slashIdx === -1) {
      setFiltered([]);
      return;
    }

    const partial = inputValue.slice(slashIdx + 1).toLowerCase();

    const results = commands.filter(
      (cmd) =>
        cmd.value.toLowerCase().includes(partial) ||
        cmd.label.toLowerCase().includes(partial),
    );

    setFiltered(results);
    setActiveIndex(0);
  }, [inputValue, showAutocomplete, commands]);

  const handleSelect = useCallback(
    (command: string | SlashCommand) => {
      onInsert(command);
      setShowAutocomplete(false);
      slashTriggerRef.current = false;
      setActiveIndex(0);
    },
    [onInsert],
  );

  // Handle keyboard navigation when the autocomplete is open.
  // Returns true if the event was handled (caller should skip default behavior).
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean => {
      if (!showAutocomplete || filtered.length === 0) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) {
          if (cmd.type === "command") {
            // Built-in command: pass the full object
            handleSelect(cmd);
          } else {
            // Skill / template: insert the text
            const slashIdx = inputValue.lastIndexOf("/");
            const before = inputValue.slice(0, slashIdx);
            handleSelect(before + cmd.value + " ");
          }
        }
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAutocomplete(false);
        slashTriggerRef.current = false;
        return true;
      }
      return false;
    },
    [showAutocomplete, filtered, activeIndex, inputValue, handleSelect],
  );

  return {
    showAutocomplete,
    handleSelect,
    activeIndex,
    filtered,
    handleKeyDown,
    // Call this when the textarea handles Tab or Enter with autocomplete open
    slashTriggerRef,
  };
}
