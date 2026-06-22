"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Authorized Personnel Only" gate for the scraper page.
 *
 * Mirrors the warning modal in scraper.templ: shows a full-screen overlay,
 * records a sessionStorage timestamp on entry, hides the overlay, and
 * re-shows it after 1 minute of user inactivity. Activity events (mousemove,
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
    // Start state: accepted if there is a recent session.
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

    const activityEvents = ["mousedown", "mousemove", "keypress", "scroll", "click", "touchstart"];
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
        className="max-w-xl w-full p-10 relative overflow-hidden mx-4 rounded-none"
        style={{ background: "#131313", border: "2px solid rgba(59, 75, 63, 0.3)" }}
      >
        <h1
          className="text-4xl font-black mb-2 uppercase tracking-tighter"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", color: "#E5E2E1" }}
        >
          Restricted Access
        </h1>
        <h2
          className="text-lg font-bold mb-8 uppercase tracking-widest pb-4"
          style={{ color: "#849587", borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
        >
          Authorized Personnel Only
        </h2>
        <p className="mb-10 text-base leading-relaxed" style={{ color: "#849587" }}>
          You are entering a restricted area.
          <br />
          Please confirm your authorization to proceed.
        </p>
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <button
            id="enter-btn"
            type="button"
            onClick={accept}
            className="flex-1 flex items-center justify-center gap-2 py-4 text-lg font-bold uppercase tracking-wider rounded-none transition-all"
            style={{
              background: "linear-gradient(135deg, #56FFA7, #00FF9C)",
              color: "#002110",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 0 20px 4px rgba(0,255,156,0.3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
            }}
          >
            Enter Site
          </button>
          <a
            href="/"
            className="flex-1 flex items-center justify-center py-4 text-lg font-bold uppercase tracking-wider text-center rounded-none transition-all"
            style={{
              background: "#1C1B1B",
              border: "1px solid rgba(59, 75, 63, 0.3)",
              color: "#E5E2E1",
            }}
          >
            Exit
          </a>
        </div>
      </div>
    </div>
  );
}
