/**
 * usePiStream — SSE hook for Pi RPC events.
 *
 * Connects to /api/pi/events (singleton) via EventSource and
 * delivers parsed Pi events to React state.
 *
 * Features: auto-reconnect with exponential backoff, connection
 * status tracking, lifecycle cleanup.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PiEvent } from "@/lib/pi/event-types";

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_DELAY = 2_000;
const MAX_DELAY = 30_000;

export interface PiStreamState {
  events: PiEvent[];
  isConnected: boolean;
  reconnectAttempts: number;
}

export function usePiStream(): PiStreamState & {
  clearEvents: () => void;
} {
  const [events, setEvents] = useState<PiEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attemptsRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    esRef.current?.close();

    const es = new EventSource("/api/pi/events");
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      attemptsRef.current = 0;
      setReconnectAttempts(0);
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data) as PiEvent;
        setEvents((prev) => [...prev, parsed]);
      } catch {
        // ignore non-JSON (keepalive comments, etc.)
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      esRef.current = null;
      setIsConnected(false);

      if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;

      const delay = Math.min(
        MAX_DELAY,
        INITIAL_DELAY * 2 ** attemptsRef.current,
      );
      attemptsRef.current += 1;
      setReconnectAttempts(attemptsRef.current);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, reconnectAttempts, clearEvents };
}
