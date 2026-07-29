"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Authorized Personnel Only" gate for the scraper page.
 *
 * Mirrors the warning modal in scraper.templ: shows a full-screen overlay,
 * records a sessionStorage timestamp on entry, hides the overlay, and
 * re-shows it after 30 seconds of user inactivity. Activity events (mousemove,
 * scroll, keypress) reset the inactivity timer.
 */
const STORAGE_KEY = "scraper_warning_accepted";
const INACTIVITY_MS = 30_000; // 30 seconds
const ACTIVITY_THROTTLE_MS = 5_000;

export function AccessGate() {
  const [accepted, setAccepted] = useState(false);
  const lastActivityRef = useRef<number>(0);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current !== null) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  const lock = () => {
    setAccepted(false);
    sessionStorage.removeItem(STORAGE_KEY);
    clearInactivityTimer();
  };

  const accept = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    sessionStorage.setItem(STORAGE_KEY, now.toString());
    setAccepted(true);
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(lock, INACTIVITY_MS);
  };

  useEffect(() => {
    const lastAccepted = sessionStorage.getItem(STORAGE_KEY);
    if (lastAccepted) {
      const age = Date.now() - parseInt(lastAccepted, 10);
      if (age < INACTIVITY_MS) {
        accept();
      }
    }

    function noteActivity() {
      if (!accepted) return;
      const now = Date.now();
      if (now - lastActivityRef.current > ACTIVITY_THROTTLE_MS) {
        lastActivityRef.current = now;
        sessionStorage.setItem(STORAGE_KEY, now.toString());
      }
      accept();
    }

    const activityEvents = ["mousedown", "mousemove", "keydown", "scroll", "click", "touchstart"];
    activityEvents.forEach((ev) => {
      document.addEventListener(ev, noteActivity, true);
    });

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter" && !accepted) {
        e.preventDefault();
        accept();
      }
    }

    document.addEventListener("keydown", handleKey);

    return () => {
      activityEvents.forEach((ev) => {
        document.removeEventListener(ev, noteActivity, true);
      });
      document.removeEventListener("keydown", handleKey);
      clearInactivityTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted]);

  return (
    <div
      className="fixed inset-0 lg:left-64 z-[100] backdrop-blur-lg flex flex-col items-center justify-center overflow-hidden transition-opacity duration-300"
      style={{
        background: "rgba(0,0,0,0.95)",
        opacity: accepted ? 0 : 1,
        pointerEvents: accepted ? "none" : "auto",
      }}
    >
      <div
        className="max-w-xl w-full p-10 relative overflow-hidden mx-4 rounded-[var(--radius-modal)]"
        style={{ background: "#1E293B", border: "1px solid rgba(71, 85, 105, 0.3)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-warning text-3xl">warning</span>
          <h1
            className="text-3xl font-black uppercase tracking-tighter font-display text-on-surface"
          >
            Restricted Access
          </h1>
        </div>
        <h2
          className="text-sm font-semibold uppercase tracking-widest pb-4 mb-6 text-on-surface-variant border-b border-outline-variant/30"
        >
          Authorized Personnel Only
        </h2>
        <p className="mb-8 text-sm leading-relaxed text-on-surface-variant">
          You are entering a restricted area.
          <br />
          Please confirm your authorization to proceed.
        </p>
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <button
            id="enter-btn"
            type="button"
            onClick={accept}
            className="flex-1 flex items-center justify-center gap-2 py-4 text-base font-bold uppercase tracking-wider rounded-[var(--radius-button)] transition-all duration-200 bg-primary text-on-primary hover:bg-primary-dim hover:shadow-[0_0_20px_4px_rgba(34,211,238,0.3)] active:scale-[0.98]"
          >
            Enter Site
          </button>
          <a
            href="/"
            className="flex-1 flex items-center justify-center py-4 text-base font-bold uppercase tracking-wider text-center rounded-[var(--radius-button)] transition-all duration-200 bg-surface border border-outline-variant/30 text-on-surface hover:bg-surface-container"
          >
            Exit
          </a>
        </div>
      </div>
    </div>
  );
}
