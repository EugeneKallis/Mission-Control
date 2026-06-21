"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import {
  buildCronExpression,
  parseCronToForm,
  type Frequency,
  type IntervalUnit,
  type DayOfWeek,
  type ScheduleFormValues,
} from "@/lib/cron";
import type { MacroOption } from "./schedules-list";

interface EditScheduleFormProps {
  scheduleId: number;
  initialEnabled: boolean;
  macros: MacroOption[];
  initialValues: ScheduleFormValues;
  initialMacroId: number;
}

/**
 * Edit form. Mirrors the Go `EditSchedule` view: same fields as the new
 * form, pre-filled with `parseCronToForm(cronExpression)`.
 */
export function EditScheduleForm({
  scheduleId,
  initialEnabled,
  macros,
  initialValues,
  initialMacroId,
}: EditScheduleFormProps) {
  const toast = useToast();
  const router = useRouter();
  const [macroId, setMacroId] = useState<string>(String(initialMacroId));
  const [frequency, setFrequency] = useState<Frequency>(initialValues.frequency);
  const [intervalValue, setIntervalValue] = useState(initialValues.intervalValue ?? "1");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    initialValues.intervalUnit ?? "minutes"
  );
  const [time, setTime] = useState(initialValues.time ?? "09:00");
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(
    (initialValues.dayOfWeek as DayOfWeek) ?? "1"
  );
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
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          macroId: Number(macroId),
          cronExpression,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.showToast("Schedule updated", "success");
      router.push("/schedules");
      router.refresh();
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : "Failed to update schedule",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Re-parse cron expression when frequency changes (helps the user
  // see what we're interpreting as the current shape).
  const handleFrequencyChange = (next: Frequency) => {
    setFrequency(next);
    // If the user just picked "interval" and we have a daily/weekly cron,
    // reset the interval value sensibly.
    if (next === "interval" && (frequency === "daily" || frequency === "weekly")) {
      setIntervalValue("1");
      setIntervalUnit("minutes");
    }
    if (next !== "interval" && frequency === "interval") {
      setTime("09:00");
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto stagger-1 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Link href="/schedules" aria-label="Back to schedules">
          <Button variant="ghost">
            <span className="material-symbols-outlined">arrow_back</span>
          </Button>
        </Link>
        <h1
          className="text-2xl font-bold text-on-surface tracking-tight"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Edit Schedule
        </h1>
        {!initialEnabled && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-none"
            style={{
              background: "rgba(107, 114, 128, 0.2)",
              color: "#9CA3AF",
            }}
          >
            Currently disabled
          </span>
        )}
      </div>

      <div
        className="p-6 rounded-none"
        style={{ background: "#1C1B1B", border: "1px solid rgba(59, 75, 63, 0.3)" }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
              style={{ background: "#2A2A2A", borderBottom: "2px solid #3B4B3F" }}
            >
              {macros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.groupName})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="frequency" className="text-sm font-semibold text-on-surface">
              Frequency
            </label>
            <select
              name="frequency"
              id="frequency"
              value={frequency}
              onChange={(e) => handleFrequencyChange(e.target.value as Frequency)}
              className="w-full px-3 py-2.5 text-sm text-on-surface outline-none transition-colors rounded-none"
              style={{ background: "#2A2A2A", borderBottom: "2px solid #3B4B3F" }}
            >
              <option value="interval">Every X Time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

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
                  style={{ background: "#2A2A2A", borderBottom: "2px solid #3B4B3F" }}
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
                  style={{ background: "#2A2A2A", borderBottom: "2px solid #3B4B3F" }}
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
                style={{ background: "#2A2A2A", borderBottom: "2px solid #3B4B3F" }}
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
                style={{ background: "#2A2A2A", borderBottom: "2px solid #3B4B3F" }}
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
            <span className="material-symbols-outlined text-lg">save</span>
            {submitting ? "Saving…" : "Update Schedule"}
          </button>
        </form>
      </div>
    </div>
  );
}
