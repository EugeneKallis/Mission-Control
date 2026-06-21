"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AccessGate } from "./access-gate";
import { ScraperCard } from "./scraper-card";
import {
  SOURCES,
  type ScraperSource,
  type ScraperTagInfo,
  type ScrapeResultView,
} from "./scraper-types";

/**
 * Scraper page client component.
 *
 * Layout (mirrors scraper.templ):
 *  - header: action toolbar (Hide All / Undo / Scrape All / Scrape Now / Clear & Rescrape)
 *  - tag filter panel (collapsible; only shows tags with count >= 2)
 *  - source tabs (141jav / ProjectJAV / PornRips)
 *  - card grid with scroll-snap (one card per viewport)
 *  - back-to-top floating button
 *  - keyboard nav (d=download, h=hide, arrows=move)
 */
export function ScraperPage({
  initialSource,
}: {
  initialSource: ScraperSource;
}) {
  const toast = useToast();
  const [source, setSource] = useState<ScraperSource>(initialSource);
  const [results, setResults] = useState<ScrapeResultView[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [anyScraping, setAnyScraping] = useState(false);
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [hideAllConfirmOpen, setHideAllConfirmOpen] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  // ── Fetch results when source changes ────────────────────────────────
  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scraper/results?source=${source}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err) {
      console.error("Failed to fetch scraper results:", err);
      toast.showToast("Failed to load scraper results", "error");
    } finally {
      setLoading(false);
    }
  }, [source, toast]);

  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

  // ── Poll scraping status every 2s (for the spinner state) ────────────
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [sourceRes, allRes] = await Promise.all([
          fetch(`/api/scraper/status?source=${source}`),
          fetch("/api/scraper/status-all"),
        ]);
        if (sourceRes.ok) {
          const data = await sourceRes.json();
          if (!cancelled) setIsScraping(Boolean(data.is_scraping));
        }
        if (allRes.ok) {
          const data = await allRes.json();
          if (!cancelled) setAnyScraping(Boolean(data.is_scraping));
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [source]);

  // ── Reload results when a scrape finishes ────────────────────────────
  useEffect(() => {
    if (!isScraping) {
      void fetchResults();
    }
  }, [isScraping, fetchResults]);

  // ── Tag info (only tags with count >= 2, matching the Go version) ───
  const tagInfo = useMemo<ScraperTagInfo[]>(() => {
    const counts = new Map<string, number>();
    for (const r of results) {
      for (const t of r.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n >= 2)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }, [results]);

  // ── Apply tag filter to results ─────────────────────────────────────
  const visibleResults = useMemo(() => {
    if (tagFilter.size === 0) return results;
    return results.filter((r) => r.tags.some((t) => tagFilter.has(t)));
  }, [results, tagFilter]);

  // ── Scroll to top helper ─────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Action handlers ──────────────────────────────────────────────────
  const triggerScrape = useCallback(
    async (src: ScraperSource) => {
      try {
        const res = await fetch("/api/scraper/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: src }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        toast.showToast(`Scraping ${src}…`, "info");
      } catch (err) {
        toast.showToast(
          err instanceof Error ? err.message : "Failed to trigger scrape",
          "error"
        );
      }
    },
    [toast]
  );

  const triggerScrapeAll = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/trigger-all", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.showToast("Scraping all sources…", "info");
      setAnyScraping(true);
    } catch (err) {
      toast.showToast("Failed to trigger scrape-all", "error");
    }
  }, [toast]);

  const hideAll = useCallback(
    async (src: ScraperSource) => {
      try {
        const res = await fetch("/api/scraper/hide-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: src }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        toast.showToast(`Hid ${data.hidden ?? 0} items`, "success");
        await fetchResults();
      } catch (err) {
        toast.showToast("Failed to hide all", "error");
      }
    },
    [toast, fetchResults]
  );

  const undoHide = useCallback(
    async (src: ScraperSource) => {
      try {
        const res = await fetch("/api/scraper/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: src }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        toast.showToast("Undone", "success");
        await fetchResults();
      } catch (err) {
        toast.showToast(
          err instanceof Error ? err.message : "Failed to undo",
          "error"
        );
      }
    },
    [toast, fetchResults]
  );

  const clearAndRescrape = useCallback(
    async (src: ScraperSource) => {
      try {
        const res = await fetch("/api/scraper/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: src }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.showToast(`Clearing & rescraping ${src}…`, "info");
        await fetchResults();
      } catch (err) {
        toast.showToast("Failed to refresh", "error");
      }
    },
    [toast, fetchResults]
  );

  const downloadItem = useCallback(
    async (id: number) => {
      try {
        const res = await fetch("/api/scraper/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        toast.showToast("Submitted to Decypharr", "success");
        await fetchResults();
      } catch (err) {
        toast.showToast(
          err instanceof Error ? err.message : "Download failed",
          "error"
        );
      }
    },
    [toast, fetchResults]
  );

  const hideItem = useCallback(
    async (id: number) => {
      // Optimistic: remove from local list so the card animates out
      const prev = results;
      setResults((rs) => rs.filter((r) => r.id !== id));
      try {
        const res = await fetch("/api/scraper/hide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.showToast("Hidden", "success");
      } catch (err) {
        setResults(prev);
        toast.showToast("Failed to hide", "error");
      }
    },
    [results, toast]
  );

  // ── Keyboard nav: d=download, h=hide, arrows=move ──────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs / textareas
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const card = visibleResults[activeIndex];
      if (!card) return;

      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        void downloadItem(card.id);
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        void hideItem(card.id);
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = Math.min(visibleResults.length - 1, activeIndex + 1);
        setActiveIndex(next);
        scrollCardIntoView(next);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = Math.max(0, activeIndex - 1);
        setActiveIndex(prev);
        scrollCardIntoView(prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, visibleResults, downloadItem, hideItem]);

  // Clamp active index when results shrink
  useEffect(() => {
    if (activeIndex >= visibleResults.length && visibleResults.length > 0) {
      setActiveIndex(visibleResults.length - 1);
    } else if (visibleResults.length === 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, visibleResults.length]);

  // Reset to first card on source / filter change
  useEffect(() => {
    setActiveIndex(0);
  }, [source, tagFilter]);

  const scrollCardIntoView = (index: number) => {
    const container = cardContainerRef.current;
    if (!container) return;
    const card = container.querySelector<HTMLElement>(`[data-index="${index}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleTag = (tag: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const clearFilters = () => setTagFilter(new Set());

  return (
    <>
      <AccessGate />
      <div className="p-4 md:p-6 stagger-1 flex flex-col gap-5 h-full min-h-0">
        {/* ── Header / toolbar ───────────────────────────────────── */}
        <div className="flex flex-col items-center mb-6 px-4 w-full">
          <div className="flex flex-wrap gap-3 justify-center mb-6 w-full">
            <button
              type="button"
              onClick={() => setHideAllConfirmOpen(true)}
              className="flex items-center gap-2 py-2 px-4 text-sm font-semibold rounded-none transition-all"
              style={{
                background: "rgba(245, 158, 11, 0.15)",
                color: "#f59e0b",
                border: "1px solid rgba(245, 158, 11, 0.3)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                visibility_off
              </span>
              Hide All
            </button>
            <button
              id="undo-hide-btn"
              onClick={() => void undoHide(source)}
              className="flex items-center gap-2 py-2 px-4 text-sm font-semibold rounded-none transition-all"
              style={{
                background: "#201F1F",
                border: "1px solid rgba(59, 75, 63, 0.3)",
                color: "#E5E2E1",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                undo
              </span>
              Undo
            </button>
            <button
              id="scrape-all-btn"
              onClick={() => void triggerScrapeAll()}
              disabled={anyScraping}
              className={`flex items-center gap-2 py-2 px-4 text-sm font-semibold rounded-none transition-all ${
                anyScraping
                  ? "cursor-not-allowed opacity-70"
                  : "btn-primary"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                auto_awesome
              </span>
              {anyScraping ? "Scraping…" : "Scrape All"}
            </button>
            <button
              id="scrape-now-btn"
              onClick={() => void triggerScrape(source)}
              disabled={isScraping}
              className={`font-semibold py-2 px-4 rounded-none transition-all flex items-center gap-2 text-sm ${
                isScraping ? "cursor-not-allowed opacity-70" : ""
              }`}
              style={{
                background: isScraping ? "#201F1F" : "linear-gradient(135deg, #56FFA7, #00FF9C)",
                color: isScraping ? "#849587" : "#002110",
              }}
            >
              {isScraping ? (
                <>
                  <span
                    className="material-symbols-outlined animate-spin"
                    style={{ fontSize: "18px" }}
                  >
                    progress_activity
                  </span>
                  Scraping…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    cloud_download
                  </span>
                  Scrape Now
                </>
              )}
            </button>
            <button
              onClick={() => void clearAndRescrape(source)}
              className="flex items-center gap-2 py-2 px-4 text-sm font-semibold rounded-none transition-all"
              style={{
                background: "rgba(255, 180, 171, 0.1)",
                color: "#FFB4AB",
                border: "1px solid rgba(255, 180, 171, 0.3)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                refresh
              </span>
              Clear &amp; Rescrape
            </button>
          </div>

          {/* Tag filter panel */}
          {tagInfo.length > 0 && (
            <div className="w-full flex flex-col items-center mb-6">
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className="text-xs font-bold uppercase tracking-widest flex items-center gap-1 transition-colors mb-2"
                style={{ color: "#849587" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "16px",
                    transform: filtersOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 200ms",
                  }}
                >
                  expand_more
                </span>
                <span>{filtersOpen ? "Hide Filters" : "Show Filters"}</span>
              </button>
              <div
                className={`flex flex-wrap gap-2 justify-center w-full max-w-4xl px-4 overflow-hidden transition-all duration-300 ${
                  filtersOpen ? "max-h-[2000px]" : "max-h-0"
                }`}
              >
                {tagInfo.map(({ tag, count }) => (
                  <label
                    key={tag}
                    className="inline-flex items-center border px-3 py-1.5 cursor-pointer transition-all rounded-none"
                    style={{
                      borderColor: tagFilter.has(tag)
                        ? "rgba(0,255,156,0.5)"
                        : "rgba(59, 75, 63, 0.3)",
                      background: "#201F1F",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={tagFilter.has(tag)}
                      onChange={() => toggleTag(tag)}
                      className="w-4 h-4 rounded-none transition-all cursor-pointer"
                      style={{ accentColor: "#00FF9C" }}
                    />
                    <span
                      className="ml-2 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "#849587" }}
                    >
                      {tag}{" "}
                      <span className="ml-1 text-[10px] font-mono" style={{ color: "#849587" }}>
                        ({count})
                      </span>
                    </span>
                  </label>
                ))}
                {tagFilter.size > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-2 py-1.5 px-4 text-xs font-semibold uppercase tracking-wider rounded-none transition-all"
                    style={{
                      background: "#201F1F",
                      border: "1px solid rgba(59, 75, 63, 0.3)",
                      color: "#E5E2E1",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                      close
                    </span>
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Source tabs */}
          <div
            className="flex overflow-x-auto w-full justify-start md:justify-center"
            style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            {SOURCES.map((s) => {
              const active = source === s;
              return (
                <button
                  key={s}
                  onClick={() => {
                    setSource(s);
                    window.history.replaceState(null, "", `/scraper?source=${s}`);
                  }}
                  className="px-8 py-2.5 text-sm font-semibold transition-all border-b-2"
                  style={{
                    color: active ? "#E5E2E1" : "#849587",
                    borderColor: active ? "#f43f5e" : "transparent",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = "#E5E2E1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = "#849587";
                    }
                  }}
                >
                  {s === "141jav" ? "141JAV" : s === "projectjav" ? "ProjectJAV" : "PornRips"}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-center text-xs italic mb-4" style={{ color: "#849587" }}>
          Source: {source} {isScraping && "· scraping…"}
        </p>

        {/* ── Card grid (scroll-snap) ─────────────────────────────── */}
        {loading ? (
          <p className="text-center py-12 italic" style={{ color: "#849587" }}>
            Loading…
          </p>
        ) : visibleResults.length === 0 ? (
          <p className="text-center py-12 italic" style={{ color: "#849587" }}>
            {results.length === 0
              ? "No results found."
              : "No results match the current tag filter."}
          </p>
        ) : (
          <div
            ref={cardContainerRef}
            className="grid grid-cols-1 gap-5"
            style={{ scrollSnapType: "y proximity" }}
          >
            {visibleResults.map((r, idx) => (
              <div
                key={r.id}
                onClick={() => setActiveIndex(idx)}
                style={
                  idx === activeIndex
                    ? { boxShadow: "0 0 0 2px rgba(0,255,156,0.4)" }
                    : undefined
                }
              >
                <ScraperCard
                  result={r}
                  onDownload={(id) => void downloadItem(id)}
                  onHide={(id) => void hideItem(id)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Back-to-top floating button */}
        {showBackToTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-5 right-5 z-40 p-3 rounded-none shadow-xl transition-all"
            style={{
              background: "rgba(0,255,156,0.15)",
              border: "1px solid rgba(0,255,156,0.4)",
              color: "#00FF9C",
            }}
            aria-label="Back to top"
          >
            <span className="material-symbols-outlined">arrow_upward</span>
          </button>
        )}
      </div>

      <ConfirmDialog
        open={hideAllConfirmOpen}
        onClose={() => setHideAllConfirmOpen(false)}
        onConfirm={() => {
          setHideAllConfirmOpen(false);
          void hideAll(source);
        }}
        title={`Hide all ${visibleResults.length} visible item${visibleResults.length === 1 ? "" : "s"}?`}
        icon="visibility_off"
        confirmLabel="Hide All"
        variant="danger"
      >
        <p className="text-sm text-on-surface-variant">
          This will hide every visible {source} card. You can undo the most recent hide.
        </p>
      </ConfirmDialog>
    </>
  );
}
