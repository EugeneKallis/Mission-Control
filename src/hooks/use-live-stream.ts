"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_DELAY = 3_000;
const MAX_DELAY = 30_000;

/**
 * Connects to the SSE terminal stream at /api/ws.
 *
 * Returns accumulated output lines, connection status, and helpers
 * for scroll control and export. Auto-reconnects on error with
 * exponential backoff up to MAX_RECONNECT_ATTEMPTS.
 */
export function useLiveStream() {
  const [lines, setLines] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    // Close any existing connection before opening a new one
    esRef.current?.close();

    const es = new EventSource("/api/ws");
    esRef.current = es;

    es.onopen = () => {
      attemptsRef.current = 0; // reset on successful connection
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "output" && msg.text) {
          setLines((prev) => [...prev, msg.text]);
        } else if (
          msg.type === "status" &&
          msg.text === "CONNECTED"
        ) {
          setIsConnected(true);
        }
      } catch {
        // Ignore parse errors on keepalive comments
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setIsConnected(false);

      // Exponential backoff with max attempts
      if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        return; // stop retrying
      }

      const delay = Math.min(MAX_DELAY, INITIAL_DELAY * 2 ** attemptsRef.current);
      attemptsRef.current += 1;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Auto-scroll: scroll to bottom when new lines arrive (if enabled)
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  /** Track whether user is scrolled to bottom (disables auto-scroll if not). */
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScrollRef.current = atBottom;
  }, []);

  const clearLines = useCallback(() => {
    setLines([]);
  }, []);

  const setIsAutoScroll = useCallback((val: boolean) => {
    autoScrollRef.current = val;
    if (val && containerRef.current) {
      containerRef.current.scrollTop =
        containerRef.current.scrollHeight;
    }
  }, []);

  return {
    lines,
    isConnected,
    clearLines,
    containerRef,
    handleScroll,
    setIsAutoScroll,
  };
}
