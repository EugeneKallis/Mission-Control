"use client";

import { useState } from "react";
import { buildCronExpression, type Frequency, type IntervalUnit, type DayOfWeek } from "@/lib/cron";
import type { MacroOption } from "./schedules-list";

interface NewScheduleFormProps {
  macros: MacroOption[];
  onCreate: (params: {
    macroId: number;
    cronExpression: string;
  }) => void | Promise<void>;
}

/**
 * "New Schedule" form with conditional fields based on the chosen
 * frequency. Mirrors the form in `SchedulesList` (schedules.templ) and
 * the Go `generateCronExpression` logic.
 */
export function NewScheduleForm({ macros, onCreate }: NewScheduleFormProps) {
  const [macroId, setMacroId] = useState<string>(macros[0]?.id ? String(macros[0].id) : "");
  const [frequency, setFrequency] = useState<Frequency>("interval");
  const [intervalValue, setIntervalValue] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("minutes");
  const [time, setTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>("1");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!macroId) return;
    setSubmitting(true);
    try {
      const cronExpression = buildCronExpression({
        frequency,
        intervalValue,
        intervalUnit,
        time,
        dayOfWeek,
      });
      await onCreate({
        macroId: Number(macroId),
        cronExpression,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Macro select */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="macro_id" className="text-sm font-semibold text-on-surface">
          Macro
        </label>
        <select
          name="macro_id"
          id="macro_id"
          value={macroId}
          onChange={(e) => setMacroId(e.target.value)}
          className="w-full px-3 py-2.5 text-sm text-on-surface outline-none transition-colors rounded-none"
          style={{
            background: "#2A2A2A",
            borderBottom: "2px solid #3B4B3F",
          }}
        >
          {macros.length === 0 && <option value="">No macros available</option>}
          {macros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.groupName})
            </option>
          ))}
        </select>
      </div>

      {/* Frequency select */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="frequency" className="text-sm font-semibold text-on-surface">
          Frequency
        </label>
        <select
          name="frequency"
          id="frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          className="w-full px-3 py-2.5 text-sm text-on-surface outline-none transition-colors rounded-none"
          style={{
            background: "#2A2A2A",
            borderBottom: "2px solid #3B4B3F",
          }}
        >
          <option value="interval">Every X Time</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      {/* Conditional fields */}
      {frequency === "interval" && (
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <label htmlFor="interval_value" className="text-sm font-semibold text-on-surface">
              Every
            </label>
            <input
              type="number"
              name="interval_value"
              id="interval_value"
              min={1}
              value={intervalValue}
              onChange={(e) => setIntervalValue(e.target.value)}
              className="w-full px-3 py-2.5 text-sm text-on-surface outline-none transition-colors rounded-none"
              style={{
                background: "#2A2A2A",
                borderBottom: "2px solid #3B4B3F",
              }}
            />
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            <label htmlFor="interval_unit" className="text-sm font-semibold text-on-surface">
              Unit
            </label>
            <select
              name="interval_unit"
              id="interval_unit"
              value={intervalUnit}
              onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
              className="w-full px-3 py-2.5 text-sm text-on-surface outline-none transition-colors rounded-none"
              style={{
                background: "#2A2A2A",
                borderBottom: "2px solid #3B4B3F",
              }}
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </div>
        </div>
      )}

      {(frequency === "daily" || frequency === "weekly") && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="time" className="text-sm font-semibold text-on-surface">
            At Time
          </label>
          <input
            type="time"
            name="time"
            id="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2.5 text-sm text-on-surface outline-none transition-colors rounded-none"
            style={{
              background: "#2A2A2A",
              borderBottom: "2px solid #3B4B3F",
            }}
          />
        </div>
      )}

      {frequency === "weekly" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="day_of_week" className="text-sm font-semibold text-on-surface">
            On Day
          </label>
          <select
            name="day_of_week"
            id="day_of_week"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
            className="w-full px-3 py-2.5 text-sm text-on-surface outline-none transition-colors rounded-none"
            style={{
              background: "#2A2A2A",
              borderBottom: "2px solid #3B4B3F",
            }}
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

      <button
        type="submit"
        disabled={submitting || !macroId}
        className="w-full flex items-center justify-center gap-2 btn-primary px-4 py-2 rounded-none text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-lg">add</span>
        {submitting ? "Adding…" : "Add Schedule"}
      </button>
    </form>
  );
}
