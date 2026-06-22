"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildCronExpression,
  type Frequency,
  type IntervalUnit,
  type DayOfWeek,
} from "@/lib/cron";
import type { MacroOption } from "./schedules-list";

interface NewScheduleFormProps {
  macros: MacroOption[];
  onCreate: (params: {
    macroId: number;
    cronExpression: string;
  }) => void | Promise<void>;
  onCancel: () => void;
}

// ── Quick-pick presets ──────────────────────────────────────────────────
// Each preset sets the form to a known good shape. The chip is
// highlighted when the current form values match the preset.

interface Preset {
  label: string;
  values: {
    frequency: Frequency;
    intervalValue: string;
    intervalUnit: IntervalUnit;
    time: string;
    dayOfWeek: DayOfWeek;
  };
}

const PRESETS: Preset[] = [
  { label: "1m", values: { frequency: "interval", intervalValue: "1", intervalUnit: "minutes", time: "09:00", dayOfWeek: "1" } },
  { label: "5m", values: { frequency: "interval", intervalValue: "5", intervalUnit: "minutes", time: "09:00", dayOfWeek: "1" } },
  { label: "15m", values: { frequency: "interval", intervalValue: "15", intervalUnit: "minutes", time: "09:00", dayOfWeek: "1" } },
  { label: "30m", values: { frequency: "interval", intervalValue: "30", intervalUnit: "minutes", time: "09:00", dayOfWeek: "1" } },
  { label: "1h", values: { frequency: "interval", intervalValue: "1", intervalUnit: "hours", time: "09:00", dayOfWeek: "1" } },
  { label: "2h", values: { frequency: "interval", intervalValue: "2", intervalUnit: "hours", time: "09:00", dayOfWeek: "1" } },
  { label: "6h", values: { frequency: "interval", intervalValue: "6", intervalUnit: "hours", time: "09:00", dayOfWeek: "1" } },
  { label: "12h", values: { frequency: "interval", intervalValue: "12", intervalUnit: "hours", time: "09:00", dayOfWeek: "1" } },
  { label: "Daily", values: { frequency: "daily", intervalValue: "1", intervalUnit: "minutes", time: "09:00", dayOfWeek: "1" } },
  { label: "Weekly", values: { frequency: "weekly", intervalValue: "1", intervalUnit: "minutes", time: "09:00", dayOfWeek: "1" } },
];

const DEFAULT_VALUES = {
  frequency: "interval" as Frequency,
  intervalValue: "5",
  intervalUnit: "minutes" as IntervalUnit,
  time: "09:00",
  dayOfWeek: "1" as DayOfWeek,
};

const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant";
const inputCls =
  "w-full px-3 py-2 text-sm text-on-surface outline-none transition-colors rounded-none focus:border-b-primary";

const inputStyle: React.CSSProperties = {
  background: "#2A2A2A",
  borderBottom: "2px solid #3B4B3F",
};

/**
 * "New Schedule" form with quick-pick preset chips.
 *
 * Mirrors the shape of the Go `generateCronExpression` logic — we only
 * emit interval / daily / weekly cron, but accept anything the edit
 * page's `parseCronToForm` can decode.
 */
export function NewScheduleForm({ macros, onCreate, onCancel }: NewScheduleFormProps) {
  const [macroId, setMacroId] = useState<string>(macros[0]?.id ? String(macros[0].id) : "");
  const [frequency, setFrequency] = useState<Frequency>(DEFAULT_VALUES.frequency);
  const [intervalValue, setIntervalValue] = useState(DEFAULT_VALUES.intervalValue);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(DEFAULT_VALUES.intervalUnit);
  const [time, setTime] = useState(DEFAULT_VALUES.time);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(DEFAULT_VALUES.dayOfWeek);
  const [submitting, setSubmitting] = useState(false);

  const currentValues = { frequency, intervalValue, intervalUnit, time, dayOfWeek };

  // Live preview — recomputed every render so the user sees what they
  // are about to schedule. Wrapped in useMemo so it only re-runs when
  // inputs change.
  const cronPreview = useMemo(() => {
    try {
      return buildCronExpression(currentValues);
    } catch {
      return "—";
    }
  }, [currentValues]);

  // ── Handlers ──────────────────────────────────────────────────────

  const applyPreset = (preset: Preset) => {
    setFrequency(preset.values.frequency);
    setIntervalValue(preset.values.intervalValue);
    setIntervalUnit(preset.values.intervalUnit);
    setTime(preset.values.time);
    setDayOfWeek(preset.values.dayOfWeek);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!macroId) return;
    setSubmitting(true);
    try {
      const cronExpression = buildCronExpression(currentValues);
      await onCreate({
        macroId: Number(macroId),
        cronExpression,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* ── Quick schedules ───────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>Quick schedules</label>
          <span className="text-[10px] text-on-surface-variant/60">
            Click to apply — refine below
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const isActive =
              currentValues.frequency === preset.values.frequency &&
              currentValues.intervalValue === preset.values.intervalValue &&
              currentValues.intervalUnit === preset.values.intervalUnit &&
              // For daily/weekly the time is user-editable, so don't
              // require an exact match to keep the chip lit.
              (preset.values.frequency === "interval" ||
                (preset.values.frequency === "daily" && frequency === "daily") ||
                (preset.values.frequency === "weekly" && frequency === "weekly"));
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={[
                  "px-3 py-1.5 text-xs font-medium rounded-none transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/40"
                    : "bg-surface-container-high text-on-surface-variant border border-outline-variant/30 hover:border-primary/40 hover:text-on-surface",
                ].join(" ")}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px w-full" style={{ background: "rgba(59, 75, 63, 0.3)" }} />

      {/* ── Macro select ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-1.5">
        <label htmlFor="macro_id" className={labelCls}>
          Macro
        </label>
        <select
          name="macro_id"
          id="macro_id"
          value={macroId}
          onChange={(e) => setMacroId(e.target.value)}
          className={`${inputCls}`}
          style={inputStyle}
        >
          {macros.length === 0 && <option value="">No macros available</option>}
          {macros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.groupName})
            </option>
          ))}
        </select>
      </div>

      {/* ── Frequency (segmented) ─────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Frequency</label>
        <div
          className="inline-flex self-start rounded-none overflow-hidden border"
          style={{ borderColor: "rgba(59, 75, 63, 0.3)" }}
        >
          {(["interval", "daily", "weekly"] as Frequency[]).map((f, i) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={[
                "px-4 py-1.5 text-xs font-semibold transition-colors",
                i > 0 ? "border-l" : "",
                frequency === f
                  ? "bg-primary/15 text-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
              ].join(" ")}
              style={i > 0 ? { borderColor: "rgba(59, 75, 63, 0.3)" } : undefined}
            >
              {f === "interval" ? "Interval" : f === "daily" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conditional fields (2-col grid on wide) ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {frequency === "interval" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="interval_value" className={labelCls}>
                Every
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  name="interval_value"
                  id="interval_value"
                  min={1}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(e.target.value)}
                  className={`flex-1 min-w-0 ${inputCls}`}
                  style={inputStyle}
                />
                <select
                  name="interval_unit"
                  id="interval_unit"
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                  className={`flex-1 min-w-0 ${inputCls}`}
                  style={inputStyle}
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                </select>
              </div>
            </div>
            <div className="hidden md:block" />
          </>
        )}

        {(frequency === "daily" || frequency === "weekly") && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="time" className={labelCls}>
                At time
              </label>
              <input
                type="time"
                name="time"
                id="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
            {frequency === "weekly" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="day_of_week" className={labelCls}>
                  On day
                </label>
                <select
                  name="day_of_week"
                  id="day_of_week"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                  <option value="0">Sunday</option>
                </select>
              </div>
            )}
          </>
        )}
      </div>

      <div className="h-px w-full" style={{ background: "rgba(59, 75, 63, 0.3)" }} />

      {/* ── Footer: cron preview + actions ────────────────────────── */}
      <div className="flex flex-col-reverse md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex gap-2 md:ml-auto">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !macroId}
            className="disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {submitting ? "Saving…" : "Save Schedule"}
          </Button>
        </div>
        <div className="flex items-center gap-2 md:mr-auto">
          <span className={labelCls}>Cron</span>
          <code
            className="px-3 py-1.5 font-mono text-sm rounded-none min-w-0 truncate"
            style={{
              background: "#0E0E0E",
              color: "#00FF9C",
              border: "1px solid rgba(59, 75, 63, 0.3)",
            }}
          >
            {cronPreview}
          </code>
        </div>
      </div>
    </form>
  );
}
