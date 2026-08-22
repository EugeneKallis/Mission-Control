"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface PriceHistoryPoint {
  t: string; // ISO timestamp
  rate: number; // ¢/kWh
}

export interface PriceHistorySupplier {
  name: string;
  points: PriceHistoryPoint[];
}

export interface PriceHistoryResponse {
  days: number;
  targetRate: number | null;
  sinceIso: string;
  suppliers: PriceHistorySupplier[];
}

const DAYS_OPTIONS = [7, 30, 60, 120, 365] as const;
export type DaysOption = (typeof DAYS_OPTIONS)[number];

export const PRICE_HISTORY_STORAGE_KEY = "mission-control:energy-prices:history-days:v1";

// ── Palette (12 colors, cycle if >12 suppliers) ─────────────────────────────
// Pick from the existing theme palette so lines stay legible in any theme.
const PALETTE = [
  "#22d3ee", // cyan
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fb7185", // rose
  "#60a5fa", // blue
  "#f97316", // orange
  "#e879f9", // fuchsia
  "#a3e635", // lime
  "#f43f5e", // crimson
  "#14b8a6", // teal
  "#c084fc", // purple
];

function colorFor(name: string, index: number): string {
  // Stable color per supplier name (so toggling it off and on keeps the
  // same color). Falls back to palette cycling for >12 suppliers.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

interface ChartProps {
  days: DaysOption;
  targetRate: number | null;
  onChangeDays: (d: DaysOption) => void;
}

export function PriceHistoryChart({ days, targetRate, onChangeDays }: ChartProps) {
  const [data, setData] = useState<PriceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/energy-prices/history?days=${d}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(days);
  }, [days, fetchHistory]);

  // Hide lines via the legend; keep the data shape the same so re-toggle is cheap.
  const [hiddenSuppliers, setHiddenSuppliers] = useState<Set<string>>(new Set());
  const toggleSupplier = useCallback((name: string) => {
    setHiddenSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Decide which suppliers to highlight in the legend default view: those
  // present in the most recent scrape. Everything else stays but is bucketed.
  const recentSupplierNames = useMemo(() => {
    if (!data) return new Set<string>();
    const ts = new Map<string, string>(); // name -> latest timestamp
    for (const s of data.suppliers) {
      for (const p of s.points) {
        const cur = ts.get(s.name);
        if (!cur || p.t > cur) ts.set(s.name, p.t);
      }
    }
    return new Set(ts.keys());
  }, [data]);

  return (
    <div
      className="mt-8 rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container-lowest/30 p-5"
      data-testid="price-history-chart"
    >
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold font-display text-on-surface">Rate History</h2>
          <p className="text-xs text-on-surface-variant">
            Each supplier&apos;s published rate over time. Hover for details.
          </p>
        </div>
        <div
          className="inline-flex rounded-[var(--radius-button)] border border-outline-variant/30 overflow-hidden self-start sm:self-auto"
          role="group"
          aria-label="Time range"
        >
          {DAYS_OPTIONS.map((d) => {
            const isActive = d === days;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDays(d)}
                aria-pressed={isActive}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "bg-transparent text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface"
                }`}
              >
                {d === 365 ? "1y" : `${d}d`}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────── */}
      {loading && !data ? (
        <div className="h-72 flex items-center justify-center">
          <div className="text-on-surface-variant animate-pulse text-sm">Loading history&hellip;</div>
        </div>
      ) : error ? (
        <div className="h-40 flex items-center justify-center text-error text-sm">
          {error}
        </div>
      ) : !data || data.suppliers.length === 0 ? (
        <EmptyChart />
      ) : (
        <ChartCanvas
          data={data}
          targetRate={targetRate}
          hiddenSuppliers={hiddenSuppliers}
          onToggleSupplier={toggleSupplier}
          recentSupplierNames={recentSupplierNames}
        />
      )}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyChart() {
  return (
    <div className="p-8 text-center" data-testid="price-history-empty">
      <p className="text-base mb-2 text-on-surface-variant">No history yet</p>
      <p className="text-sm text-on-surface-variant">
        Each scrape keeps every previous offer in the database. The graph fills in
        as soon as a second scrape lands — backfills once you scrape again tomorrow.
      </p>
    </div>
  );
}

// ── Chart canvas ────────────────────────────────────────────────────────────
interface ChartCanvasProps {
  data: PriceHistoryResponse;
  targetRate: number | null;
  hiddenSuppliers: Set<string>;
  onToggleSupplier: (name: string) => void;
  recentSupplierNames: Set<string>;
}

function ChartCanvas({
  data,
  targetRate,
  hiddenSuppliers,
  onToggleSupplier,
  recentSupplierNames,
}: ChartCanvasProps) {
  // Dimensions
  const W = 800;
  const H = 320;
  const padding = { top: 16, right: 16, bottom: 36, left: 52 };
  const innerW = W - padding.left - padding.right;
  const innerH = H - padding.top - padding.bottom;

  // X range: from earliest data point to now, capped at sinceIso on the right.
  // We display the request window (sinceIso..now) so the chart is honest about
  // what it covers even with only one scrape so far.
  const windowStart = new Date(data.sinceIso).getTime();
  const windowEnd = data.suppliers
    .flatMap((s) => s.points.map((p) => new Date(p.t).getTime()))
    .reduce((max, t) => (t > max ? t : max), Date.now());

  // Y bounds: union of every visible point + a 5% pad.
  const visible = data.suppliers.filter((s) => !hiddenSuppliers.has(s.name));
  const allRates = visible.flatMap((s) => s.points.map((p) => p.rate));
  const minRate = allRates.length ? Math.min(...allRates) : 0;
  const maxRate = allRates.length ? Math.max(...allRates) : 1;
  const yPad = (maxRate - minRate) * 0.1 || 1;
  const yMin = Math.max(0, minRate - yPad);
  const yMax = maxRate + yPad;

  // Scales
  const xScale = (t: number) =>
    padding.left +
    ((t - windowStart) / (windowEnd - windowStart || 1)) * innerW;
  const yScale = (r: number) =>
    padding.top + innerH - ((r - yMin) / (yMax - yMin || 1)) * innerH;

  // Y-axis ticks (4-5)
  const yTicks = useMemo(() => buildTicks(yMin, yMax, 5), [yMin, yMax]);

  // X-axis ticks (5 evenly spaced)
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const n = 5;
    for (let i = 0; i <= n; i++) {
      ticks.push(windowStart + ((windowEnd - windowStart) * i) / n);
    }
    return ticks;
  }, [windowStart, windowEnd]);

  // Hover tooltip
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    supplier: string;
    rate: number;
    t: string;
  } | null>(null);
  const onMove: React.MouseEventHandler<SVGSVGElement> = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    if (
      px < padding.left ||
      px > W - padding.right ||
      py < padding.top ||
      py > H - padding.bottom
    ) {
      setHover(null);
      return;
    }
    // Find the nearest visible series at this x
    const tAtX =
      windowStart + ((px - padding.left) / innerW) * (windowEnd - windowStart);
    let best: { supplier: string; rate: number; t: string; dist: number } | null = null;
    for (const s of visible) {
      for (const p of s.points) {
        const dist = Math.abs(new Date(p.t).getTime() - tAtX);
        if (!best || dist < best.dist) {
          best = { supplier: s.name, rate: p.rate, t: p.t, dist };
        }
      }
    }
    if (best) {
      setHover({ x: px, y: py, supplier: best.supplier, rate: best.rate, t: best.t });
    }
  };

  // Group visible suppliers: those that have ANY data in this window first
  const recentVisible = visible.filter((s) => recentSupplierNames.has(s.name));
  const olderVisible = visible.filter((s) => !recentSupplierNames.has(s.name));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block"
          role="img"
          aria-label={`Energy price history over the last ${data.days} days`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          data-testid="price-history-svg"
        >
        {/* Grid */}
        {yTicks.map((t, i) => (
          <line
            key={`g${i}`}
            x1={padding.left}
            x2={W - padding.right}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeDasharray="3 3"
          />
        ))}

        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text
            key={`y${i}`}
            x={padding.left - 8}
            y={yScale(t)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-current text-[10px] text-on-surface-variant"
          >
            {t.toFixed(2)}¢
          </text>
        ))}

        {/* X axis labels */}
        {xTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={xScale(t)}
            y={H - padding.bottom + 16}
            textAnchor="middle"
            className="fill-current text-[10px] text-on-surface-variant"
          >
            {formatXLabel(t, data.days)}
          </text>
        ))}

        {/* Axis lines */}
        <line
          x1={padding.left}
          x2={W - padding.right}
          y1={H - padding.bottom}
          y2={H - padding.bottom}
          stroke="currentColor"
          strokeOpacity={0.15}
        />

        {/* Target-rate reference line */}
        {targetRate !== null && targetRate >= yMin && targetRate <= yMax && (
          <g>
            <line
              x1={padding.left}
              x2={W - padding.right}
              y1={yScale(targetRate)}
              y2={yScale(targetRate)}
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              data-testid="target-line"
            />
            <text
              x={W - padding.right - 4}
              y={yScale(targetRate) - 6}
              textAnchor="end"
              className="fill-current text-[10px]"
              fill="#fbbf24"
            >
              Target {targetRate.toFixed(2)}¢
            </text>
          </g>
        )}

        {/* Series — older suppliers drawn under recent for legibility */}
        {[...olderVisible, ...recentVisible].map((s, seriesIdx) => {
          const color = colorFor(s.name, seriesIdx);
          const path = buildPath(s.points, xScale, yScale);
          return (
            <g key={s.name}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={path}
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={xScale(new Date(p.t).getTime())}
                  cy={yScale(p.rate)}
                  r={2}
                  fill={color}
                />
              ))}
            </g>
          );
        })}

        {/* Tooltip crosshair on SVG */}
        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={padding.top}
              y2={H - padding.bottom}
              stroke="currentColor"
              strokeOpacity={0.3}
            />
            <circle
              cx={xScale(new Date(hover.t).getTime())}
              cy={yScale(hover.rate)}
              r={3.5}
              fill={colorFor(hover.supplier, 0)}
              stroke="white"
              strokeWidth={1}
            />
          </g>
        )}
        </svg>

        {/* Hover tooltip HTML overlay (anchored at hover position) */}
        {hover && (
          <div
            className="absolute pointer-events-none px-2 py-1 text-xs rounded bg-surface-container-highest text-on-surface shadow-md border border-outline-variant/30"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: `${(hover.y / H) * 100}%`,
              transform: "translate(-50%, -130%)",
            }}
            data-testid="price-history-tooltip"
          >
            <div className="font-semibold">{hover.supplier}</div>
            <div className="font-mono">{hover.rate.toFixed(2)}¢/kWh</div>
            <div className="text-on-surface-variant">
              {new Date(hover.t).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      <Legend
        suppliers={data.suppliers}
        hidden={hiddenSuppliers}
        onToggle={onToggleSupplier}
        recentSupplierNames={recentSupplierNames}
      />
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────
function Legend({
  suppliers,
  hidden,
  onToggle,
  recentSupplierNames,
}: {
  suppliers: PriceHistorySupplier[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
  recentSupplierNames: Set<string>;
}) {
  const [showAll, setShowAll] = useState(false);
  const recent = suppliers.filter((s) => recentSupplierNames.has(s.name));
  const older = suppliers.filter((s) => !recentSupplierNames.has(s.name));
  const visible = showAll ? [...recent, ...older] : recent.slice(0, 8);
  const remainder = recent.length + older.length - visible.length;

  return (
    <div className="text-xs" data-testid="price-history-legend">
      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <div className="text-on-surface-variant italic">No suppliers visible</div>
        ) : (
          visible.map((s, i) => {
            const color = colorFor(s.name, i);
            const isHidden = hidden.has(s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => onToggle(s.name)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-container/50 transition-colors text-left"
                title={isHidden ? "Show line" : "Hide line"}
                aria-pressed={!isHidden}
              >
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{
                    backgroundColor: color,
                    opacity: isHidden ? 0.25 : 1,
                  }}
                />
                <span
                  className={`flex-1 truncate ${isHidden ? "line-through text-on-surface-variant" : "text-on-surface"}`}
                >
                  {s.name}
                </span>
                <span className="text-on-surface-variant font-mono">
                  {lastPointRate(s)}
                </span>
              </button>
            );
          })
        )}
        {remainder > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full text-center text-primary hover:underline py-1"
          >
            {showAll ? "Show fewer" : `Show all (${remainder} more)`}
          </button>
        )}
      </div>
    </div>
  );
}

function lastPointRate(s: PriceHistorySupplier): string {
  if (s.points.length === 0) return "—";
  const p = s.points[s.points.length - 1];
  return `${p.rate.toFixed(2)}¢`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

function buildPath(
  points: PriceHistoryPoint[],
  xScale: (t: number) => number,
  yScale: (r: number) => number,
): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => {
      const x = xScale(new Date(p.t).getTime());
      const y = yScale(p.rate);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatXLabel(t: number, days: number): string {
  const d = new Date(t);
  if (days >= 365) {
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  if (days >= 60) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
