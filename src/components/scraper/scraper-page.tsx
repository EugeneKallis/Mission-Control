"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AccessGate } from "./access-gate";
import { ScraperCard } from "./scraper-card";
import {
  SOURCES,
  type ScraperSource,
  type ScrapeResultView,
} from "./scraper-types";

/**
 * Scraper page client component.
 *
 * Layout (mirrors scraper.templ exactly):
 *  - #scraper-content-container is the scroll container (the page
 *    root): max-w-1400, h-full, overflow-y-auto, scroll-snap-type: y
 *    mandatory. The AppShell main area's overflow is suppressed via
 *    the `body:has(#scraper-content-container) #main-scroll-container`
 *    rule in globals.css.
 *  - #scraper-header-section is the first snap target (toolbar, tag
 *    filter, source tabs, status line).
 *  - Each `.card-snap-area` card is a snap target with
 *    min-height: 90dvh (mobile) / 100dvh (md+).
 *  - Back-to-top button is fixed at the bottom-right of the viewport.
 *  - Keyboard nav (d=download, h=hide, arrows=move between snap
 *    targets) finds the active card by its proximity to the viewport
 *    top, mirroring the ServerTool JS.
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
  const [hideAllConfirmOpen, setHideAllConfirmOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fetchResultsRef = useRef<() => Promise<void>>(async () => {});

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
    fetchResultsRef.current = fetchResults;
  }, [fetchResults]);

  useEffect(() => {
    void fetchResultsRef.current();
  }, [source]);

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
      void fetchResultsRef.current();
    }
  }, [isScraping]);

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

  // After hiding or downloading, advance the scroll to the next visible
  // card — exactly like the ServerTool does after a successful POST.
  //
  // The caller is expected to have ALREADY removed the card from the
  // layout (display: none) before calling this, so `next.offsetTop`
  // reflects the post-removal layout. If we snap before the layout
  // shift, the browser's `scroll-snap-type: y mandatory` re-evaluates
  // ~300ms later when the card finally disappears and re-snaps the
  // user to a different (often wrong) target — frequently the header
  // at the top, which is the "scrolls to top" bug.
  //
  // Walk forward in the full DOM list (the removed card is, by
  // definition, not "visible" anymore, so findIndex on a filtered
  // visible list always returned -1) to the next still-visible card,
  // skipping any previously-hidden cards in between.
  const advanceToNextCard = useCallback((removedId: number) => {
    const container = containerRef.current;
    if (!container) return;
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>(".scraper-card")
    );
    const removedIdx = cards.findIndex(
      (c) => c.getAttribute("data-id") === String(removedId)
    );
    if (removedIdx === -1) return;
    let next: HTMLElement | null = null;
    for (let i = removedIdx + 1; i < cards.length; i++) {
      const c = cards[i];
      if (c.style.display === "none" || c.classList.contains("is-user-hidden")) {
        continue;
      }
      next = c;
      break;
    }
    if (next) {
      container.scrollTo({ top: next.offsetTop, behavior: "smooth" });
    }
  }, []);

  const downloadItem = useCallback(
    async (id: number) => {
      // Optimistic: remove the card from the layout and snap to the
      // next one in a single synchronous step. Applying display: none
      // first (instead of fading then setting display: none after
      // 300ms) is critical: if we snap before the layout shift, the
      // browser's mandatory scroll-snap re-evaluates 300ms later when
      // the card finally disappears and can re-snap the user to a
      // different target — often the header at the top.
      const card = containerRef.current?.querySelector<HTMLElement>(
        `.scraper-card[data-id="${id}"]`
      );
      if (card) {
        card.classList.add("is-user-hidden");
        card.style.display = "none";
        advanceToNextCard(id);
      }
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
        toast.showToast("Sent to Decypharr!", "success");
      } catch (err) {
        // Restore on failure
        if (card) {
          card.style.display = "";
          card.classList.remove("is-user-hidden");
        }
        toast.showToast(
          err instanceof Error ? err.message : "Download failed",
          "error"
        );
      }
    },
    [toast, advanceToNextCard]
  );

  const hideItem = useCallback(
    async (id: number) => {
      // See downloadItem above for why this is a single synchronous
      // step instead of fade-then-display:none.
      const card = containerRef.current?.querySelector<HTMLElement>(
        `.scraper-card[data-id="${id}"]`
      );
      if (card) {
        card.classList.add("is-user-hidden");
        card.style.display = "none";
        advanceToNextCard(id);
      }
      try {
        const res = await fetch("/api/scraper/hide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.showToast("Hidden", "success");
      } catch (err) {
        if (card) {
          card.style.display = "";
          card.classList.remove("is-user-hidden");
        }
        toast.showToast("Failed to hide", "error");
      }
    },
    [toast, advanceToNextCard]
  );

  // ── Keyboard nav (mirrors ServerTool scraper.templ) ─────────────────
  // D / H: find the card whose top is closest to (and at or above)
  //        the viewport top — that is the "active" card. Trigger
  //        download / hide on it.
  // j / k / ArrowDown / ArrowUp: the snap targets are the header
  //        section and every card. Move to the next / previous one
  //        based on the current scrollTop.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const container = containerRef.current;
      if (!container) return;

      const key = e.key.toLowerCase();
      if (key === "d" || key === "h") {
        e.preventDefault();
        const cards = Array.from(
          container.querySelectorAll<HTMLElement>(".scraper-card")
        ).filter(
          (c) => c.style.display !== "none" && !c.classList.contains("is-user-hidden")
        );
        let activeCard: HTMLElement | null = null;
        let bestTop = Infinity;
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          if (rect.top >= -100 && rect.top < bestTop) {
            bestTop = rect.top;
            activeCard = card;
          }
        }
        if (!activeCard) return;
        const id = Number(activeCard.getAttribute("data-id"));
        if (!id) return;
        if (key === "d") void downloadItem(id);
        else void hideItem(id);
        return;
      }

      const isDown = e.key === "ArrowDown" || key === "j";
      const isUp = e.key === "ArrowUp" || key === "k";
      if (!isDown && !isUp) return;
      e.preventDefault();
      const targets: HTMLElement[] = [];
      const header = container.querySelector<HTMLElement>("#scraper-header-section");
      if (header) targets.push(header);
      container
        .querySelectorAll<HTMLElement>(".scraper-card")
        .forEach((c) => {
          // Skip user-hidden cards: their offsetTop reads as 0
          // (display:none elements have no layout box), so scrolling
          // to them would jump to the top. Hide/down already advance
          // past hidden cards, so arrow keys should too.
          if (c.style.display === "none" || c.classList.contains("is-user-hidden")) return;
          targets.push(c);
        });
      if (targets.length === 0) return;
      const scrollTop = container.scrollTop;
      let idx = 0;
      for (let i = 0; i < targets.length; i++) {
        if (targets[i].offsetTop <= scrollTop + 100) idx = i;
      }
      idx = isDown ? Math.min(idx + 1, targets.length - 1) : Math.max(idx - 1, 0);
      container.scrollTo({ top: targets[idx].offsetTop, behavior: "smooth" });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [downloadItem, hideItem]);

  // ── Back-to-top: show when scrolled past 300px (matches ServerTool) ─
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      setShowBackToTop(container.scrollTop > 300);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <AccessGate />
      <div
        ref={containerRef}
        id="scraper-content-container"
        className="max-w-[1400px] mx-auto relative flex flex-col h-full overflow-y-auto"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {/* ── Header section (first snap target) ───────────────────── */}
        <div
          id="scraper-header-section"
          className="pt-5 pb-2 flex-shrink-0"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="flex flex-col items-center mb-6 px-4 w-full max-w-full">
            <div className="flex flex-wrap gap-3 justify-center mb-6 w-full">
              <div className="inline">
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
              </div>
              <div className="inline">
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
              </div>
              <div className="inline">
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
              </div>
              <div className="inline">
                <button
                  id="scrape-now-btn"
                  onClick={() => void triggerScrape(source)}
                  disabled={isScraping}
                  className={`font-semibold py-2 px-4 rounded-none transition-all flex items-center gap-2 text-sm ${
                    isScraping ? "cursor-not-allowed opacity-70" : ""
                  }`}
                  style={{
                    background: isScraping ? "#1C1B1B" : "linear-gradient(135deg, #56FFA7, #00FF9C)",
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
              </div>
              <div className="inline">
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
            </div>

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
                      // Scroll back to the top so the header is visible.
                      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
            Source: {source}
          </p>
        </div>

        {/* ── Card grid (each card is a snap target) ────────────────── */}
        {loading ? (
          <p className="text-center py-12 italic" style={{ color: "#849587" }}>
            Loading…
          </p>
        ) : results.length === 0 ? (
          <p className="text-center py-12 italic" style={{ color: "#849587" }}>
            No results found.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {results.map((r) => (
              <ScraperCard
                key={r.id}
                result={r}
                onDownload={(id) => void downloadItem(id)}
                onHide={(id) => void hideItem(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Back-to-top button (fixed, bottom-right) ──────────────── */}
      <button
        onClick={scrollToTop}
        className="fixed bottom-5 right-5 p-3 rounded-full shadow-lg transition-all duration-300 z-50"
        style={{
          background: "#00FF9C",
          color: "#002110",
          opacity: showBackToTop ? 1 : 0,
          transform: showBackToTop ? "translateY(0)" : "translateY(2rem)",
          pointerEvents: showBackToTop ? "auto" : "none",
        }}
        aria-label="Back to top"
      >
        <span className="material-symbols-outlined">arrow_upward</span>
      </button>

      <ConfirmDialog
        open={hideAllConfirmOpen}
        onClose={() => setHideAllConfirmOpen(false)}
        onConfirm={() => {
          setHideAllConfirmOpen(false);
          void hideAll(source);
        }}
        title={`Hide all ${results.length} item${results.length === 1 ? "" : "s"}?`}
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
