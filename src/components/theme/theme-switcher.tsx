"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTheme } from "./theme-provider";
import { THEMES, type ThemeId } from "@/lib/theme";

interface ThemeSwitcherProps {
  /** Semantic class for the trigger button size. Default "default". */
  variant?: "default" | "compact";
}

/**
 * Accessible theme-switcher with a trigger button and a two-column palette
 * grid. Uses radiogroup + roving-focus navigation for full keyboard support.
 * Closes on Escape, outside click, or selection.
 */
export function ThemeSwitcher({ variant = "default" }: ThemeSwitcherProps) {
  const { themeId, setThemeId } = useTheme();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Focus the selected option when the panel opens
  useEffect(() => {
    if (!open) return;
    // Small delay so the panel DOM is rendered
    const id = setTimeout(() => {
      const btn = optionRefs.current.get(themeId);
      if (btn) {
        btn.focus();
      } else {
        // Fall back to first option
        const first = THEMES[0];
        const firstBtn = optionRefs.current.get(first.id);
        firstBtn?.focus();
      }
    }, 0);
    return () => clearTimeout(id);
  }, [open, themeId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Arrow/Home/End roving focus within the radiogroup.
  const handlePanelKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const navigationKeys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
      if (!navigationKeys.includes(e.key)) return;

      e.preventDefault();
      const currentIndex = THEMES.findIndex((t) => t.id === themeId);
      let nextIndex: number;
      if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = THEMES.length - 1;
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % THEMES.length;
      } else {
        nextIndex = (currentIndex - 1 + THEMES.length) % THEMES.length;
      }

      const nextId = THEMES[nextIndex].id;
      optionRefs.current.get(nextId)?.focus();
      setThemeId(nextId);
    },
    [themeId, setThemeId],
  );

  const handleSelect = useCallback(
    (id: ThemeId) => {
      setThemeId(id);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [setThemeId],
  );

  const current = THEMES.find((t) => t.id === themeId);

  const triggerLabel = current
    ? `Theme: ${current.label}. Click to change.`
    : "Select a theme";

  const setOptionRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) {
      optionRefs.current.set(id, el);
    } else {
      optionRefs.current.delete(id);
    }
  }, []);

  if (variant === "compact") {
    return (
      <div className="relative shrink-0">
        <button
          ref={triggerRef}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center w-11 h-11 hover:bg-surface-container transition-colors rounded-[var(--radius-button)]"
          aria-label={triggerLabel}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
        >
          <span className="material-symbols-outlined text-on-surface text-xl">
            palette
          </span>
        </button>

        {open && (
          <ThemePanel
            id={panelId}
            panelRef={panelRef}
            currentId={themeId}
            onSelect={handleSelect}
            setOptionRef={setOptionRef}
            onKeyDown={handlePanelKeyDown}
            position="down"
            align="right"
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 w-full text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60 transition-colors rounded-[var(--radius-button)]"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        {/* Mini palette swatch */}
        {current && (
          <span className="flex gap-0.5">
            {current.swatches.slice(0, 3).map((s, i) => (
              <span
                key={i}
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: s }}
              />
            ))}
          </span>
        )}
        <span className="flex-1 text-left">{current?.label ?? "Theme"}</span>
        <span className="material-symbols-outlined text-base">palette</span>
      </button>

      {open && (
        <ThemePanel
          id={panelId}
          panelRef={panelRef}
          currentId={themeId}
          onSelect={handleSelect}
          setOptionRef={setOptionRef}
          onKeyDown={handlePanelKeyDown}
          position="up"
          align="left"
        />
      )}
    </div>
  );
}

// ── Shared Panel ───────────────────────────────────────────────────────────

interface ThemePanelProps {
  id: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  currentId: ThemeId;
  onSelect: (id: ThemeId) => void;
  setOptionRef: (id: string, el: HTMLButtonElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  position: "up" | "down";
  align: "left" | "right";
}

function ThemePanel({
  id,
  panelRef,
  currentId,
  onSelect,
  setOptionRef,
  onKeyDown,
  position,
  align,
}: ThemePanelProps) {
  const posClass = position === "down"
    ? "top-full mt-2 origin-top-left"
    : "bottom-full mb-2 origin-bottom-left";

  const alignClass = align === "right"
    ? "right-0 origin-top-right"
    : "left-0";

  return (
    <div
      id={id}
      ref={panelRef}
      role="radiogroup"
      aria-label="Select a theme"
      onKeyDown={onKeyDown}
      className={`absolute ${posClass} ${alignClass} z-50 w-[228px] p-2 rounded-[var(--radius-modal)] shadow-2xl max-h-[min(320px,calc(100vh-8rem))] overflow-y-auto overscroll-contain`}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((theme) => {
          const selected = theme.id === currentId;
          return (
            <button
              key={theme.id}
              ref={(el) => setOptionRef(theme.id, el)}
              role="radio"
              aria-checked={selected}
              aria-label={`${theme.label}${selected ? " (current)" : ""}`}
              onClick={() => onSelect(theme.id)}
              tabIndex={selected ? 0 : -1}
              className={`
                flex flex-col items-start gap-2 p-2.5 rounded-lg transition-all text-left
                ${selected
                  ? "bg-surface-container shadow-sm ring-1 ring-primary/40"
                  : "hover:bg-surface-container/60"}
              `}
            >
              {/* Palette swatches row */}
              <span className="flex gap-1">
                {theme.swatches.map((s, i) => (
                  <span
                    key={i}
                    className="inline-block w-4 h-4 rounded-full ring-1 ring-white/10"
                    style={{ background: s }}
                  />
                ))}
              </span>

              {/* Label + checkmark */}
              <span className="flex items-center gap-1.5 w-full">
                <span className="text-xs font-semibold text-on-surface flex-1">
                  {theme.label}
                </span>
                {selected && (
                  <span className="material-symbols-outlined text-primary text-sm" aria-hidden="true">
                    check
                  </span>
                )}
              </span>

              {/* Description — full opacity for readability */}
              <span className="text-[10px] text-on-surface-variant leading-tight">
                {theme.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
