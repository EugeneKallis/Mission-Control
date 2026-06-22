"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ScriptEntry {
  path: string;
  name: string;
  category: string;
  description: string;
}

/**
 * BrowseScripts — a small dropdown button that lists available scripts
 * from the scripts/ tree. Selecting one populates the command input
 * with `bun run <path>`.
 *
 * The dropdown is rendered through a React portal at `document.body` and
 * positioned with `position: fixed`. This is required because the macro
 * row on the Admin page has `overflow: hidden` on its container (to
 * clip the rounded corners), which would otherwise clip an in-flow
 * absolutely-positioned dropdown.
 *
 * Props:
 *   onSelect: (cmd: string) => void   — called with the chosen command
 *   size?: "sm" | "xs"               — button size (default "xs")
 */
export function BrowseScripts({
  onSelect,
  size = "xs",
}: {
  onSelect: (cmd: string) => void;
  size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [pos, setPos] = useState<{ top: number; right: number; width: number } | null>(null);
  const fetchedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch scripts once
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetch("/api/scripts")
      .then((r) => r.json())
      .then((data: ScriptEntry[]) => setScripts(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Compute dropdown position (fixed coordinates relative to viewport)
  // and keep it updated on scroll/resize while open.
  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
        width: Math.max(260, rect.width),
      });
    };

    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Focus the filter input when the dropdown opens
  useEffect(() => {
    if (open) {
      // Defer to next tick so the portal is mounted
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Filter scripts by name, path, description, or category
  const filtered = filter.trim()
    ? scripts.filter((s) => {
        const q = filter.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.path.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
        );
      })
    : scripts;

  // Group filtered scripts by category
  const grouped = filtered.reduce<Record<string, ScriptEntry[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  // Sort categories: arr, media, plex, util, then rest
  const categoryOrder = ["arr", "media", "plex", "util"];
  const sortedCategories = [
    ...categoryOrder.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !categoryOrder.includes(c)),
  ];

  const handleSelect = useCallback(
    (entry: ScriptEntry) => {
      onSelect(`bun run ${entry.path}`);
      setOpen(false);
      setFilter("");
    },
    [onSelect],
  );

  const sizeClass = size === "sm" ? "text-xs px-2 py-1" : "text-[10px] px-1.5 py-0.5";

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`font-semibold rounded-none transition-colors whitespace-nowrap ${sizeClass} ${
          open
            ? "bg-[#618B6B] text-white"
            : "bg-[#2A2A2A] text-[#849587] hover:bg-[#3B4B3F] hover:text-[#E5E2E1]"
        }`}
        title="Browse scripts"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined" style={{ fontSize: size === "sm" ? "14px" : "11px" }}>
            folder
          </span>
          Scripts
          <span className="material-symbols-outlined" style={{ fontSize: size === "sm" ? "14px" : "11px" }}>
            {open ? "expand_less" : "expand_more"}
          </span>
        </span>
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            className="fixed z-[1000] rounded shadow-xl flex flex-col"
            style={{
              top: pos.top,
              right: pos.right,
              width: pos.width,
              maxHeight: "min(400px, calc(100vh - " + pos.top + "px - 8px))",
              background: "#1C1B1B",
              border: "1px solid rgba(59, 75, 63, 0.3)",
            }}
          >
            {/* Filter input */}
            <div
              className="p-2 shrink-0"
              style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
            >
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter scripts…"
                className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-2 py-1 text-[10px] text-[#E5E2E1] outline-none focus:border-[#618B6B] font-mono"
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            {/* Script list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading && (
                <div className="px-3 py-2 text-[10px] text-[#849587]">Loading…</div>
              )}
              {error && (
                <div className="px-3 py-2 text-[10px] text-[#FFB4AB]">{error}</div>
              )}
              {!loading && !error && filtered.length === 0 && (
                <div className="px-3 py-2 text-[10px] text-[#849587]">
                  {filter ? `No scripts match "${filter}"` : "No scripts found"}
                </div>
              )}
              {!loading && !error && filtered.length > 0 && (
                <>
                  {sortedCategories.map((cat) => (
                    <div key={cat}>
                      <div
                        className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#618B6B] sticky top-0"
                        style={{ background: "#1C1B1B", borderBottom: "1px solid rgba(59, 75, 63, 0.1)" }}
                      >
                        {cat === "root" ? "Root" : cat}
                      </div>
                      {grouped[cat].map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-[#2A2A2A] transition-colors"
                          onClick={() => handleSelect(entry)}
                          title={entry.description || entry.name}
                        >
                          <div className="text-[#E5E2E1] font-mono">{entry.name}</div>
                          {entry.description && (
                            <div className="text-[#849587] truncate">{entry.description}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer with match count */}
            {!loading && !error && scripts.length > 0 && (
              <div
                className="px-3 py-1 text-[9px] text-[#3B4B3F] shrink-0"
                style={{ borderTop: "1px solid rgba(59, 75, 63, 0.1)" }}
              >
                {filter
                  ? `${filtered.length} of ${scripts.length} match`
                  : `${scripts.length} script${scripts.length === 1 ? "" : "s"}`}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
