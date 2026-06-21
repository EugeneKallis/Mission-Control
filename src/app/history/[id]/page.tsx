"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

interface HistoryDetail {
  id: number;
  macroId: number;
  startTime: string;
  endTime: string | null;
  status: string;
  output: string | null;
  triggeredBy: string;
  macro: { name: string };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "Running...";
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const sec = Math.round((e - s) / 1000);
  return `${sec}s`;
}

function statusPill(status: string) {
  const colors: Record<string, { bg: string; fg: string; border: string }> = {
    running: { bg: "rgba(76, 214, 255, 0.1)", fg: "#4CD6FF", border: "rgba(76, 214, 255, 0.3)" },
    success: { bg: "rgba(97, 139, 107, 0.1)", fg: "#618B6B", border: "rgba(97, 139, 107, 0.3)" },
    failed: { bg: "rgba(255, 180, 171, 0.1)", fg: "#FFB4AB", border: "rgba(255, 180, 171, 0.3)" },
  };
  const c = colors[status] || colors.running;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
      {status}
    </span>
  );
}

export default function HistoryDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [item, setItem] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/history/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setItem(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 h-full flex flex-col gap-5">
        {/* Back + header */}
        <div className="shrink-0">
          <Link href="/history" className="text-[#618B6B] hover:underline text-sm inline-flex items-center gap-1 mb-3">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </Link>

          {loading ? (
            <div className="text-[#849587]">Loading...</div>
          ) : error ? (
            <div className="text-[#FFB4AB]">{error}</div>
          ) : item ? (
            <>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-[#E5E2E1] tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                  Log: {item.macro.name}
                </h1>
                {statusPill(item.status)}
              </div>
              <div className="flex items-center gap-4 text-xs text-[#849587]">
                <span>Started: {formatTime(item.startTime)}</span>
                <span>Duration: {formatDuration(item.startTime, item.endTime)}</span>
                <span>Triggered by: {item.triggeredBy}</span>
              </div>
            </>
          ) : null}
        </div>

        {/* Terminal output */}
        {item && (
          <div
            className="flex-1 min-h-0 relative rounded-lg overflow-hidden"
            style={{ background: "#0E0E0E", border: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            <div
              className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
              style={{
                background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 156, 0.08) 2px, rgba(0, 255, 156, 0.08) 4px)",
              }}
            />
            <pre
              className="absolute inset-0 p-4 font-mono text-xs leading-relaxed overflow-auto whitespace-pre-wrap"
              style={{
                color: "#E5E2E1",
                scrollbarWidth: "thin",
                scrollbarColor: "#3B4B3F transparent",
              }}
            >
              {item.output || "No output recorded."}
            </pre>
          </div>
        )}
      </div>
    </AppShell>
  );
}
