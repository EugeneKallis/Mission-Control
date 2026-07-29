"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import {
  buildCronExpression,
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

const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant";
const inputCls =
  "w-full px-3 py-2 text-sm text-on-surface outline-none transition-colors rounded-[var(--radius-button)] focus:border-b-primary bg-surface-container-high/50 border border-outline-variant/30 focus:border-primary";

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

  const currentValues = { frequency, intervalValue, intervalUnit, time, dayOfWeek };

  const cronPreview = useMemo(() => {
    try {
      return buildCronExpression(currentValues);
    } catch {
      return "\u2014";
    }
  }, [currentValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!macroId) return;
    setSubmitting(true);
    try {
      const cronExpression = buildCronExpression(currentValues);
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

  return (
    <div className="flex flex-col gap-6 stagger-1 p-4 md:p-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/schedules" aria-label="Back to schedules">
          <Button variant="ghost">
            <span className="material-symbols-outlined">arrow_back</span>
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface tracking-tight font-display">
          Edit Schedule
        </h1>
        {!initialEnabled && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-[var(--radius-pill)] bg-on-surface-variant/20 text-on-surface-variant">
            Currently disabled
          </span>
        )}
      </div>

      <div className="p-6 rounded-[var(--radius-card)] bg-surface border border-outline-variant/30">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-1.5">
            <label htmlFor="e_macro_id" className={labelCls}>
              Macro
            </label>
            <select
              name="macro_id"
              id="e_macro_id"
              value={macroId}
              onChange={(e) => setMacroId(e.target.value)}
              className={inputCls}
            >
              {macros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.groupName})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Frequency</label>
            <div className="inline-flex self-start rounded-[var(--radius-button)] overflow-hidden border border-outline-variant/30">
              {(["interval", "daily", "weekly"] as Frequency[]).map((f, i) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
                    i > 0 ? "border-l border-outline-variant/30" : ""
                  } ${
                    frequency === f
                      ? "bg-primary/15 text-primary"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {f === "interval" ? "Interval" : f === "daily" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {frequency === "interval" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="e_interval_value" className={labelCls}>
                    Every
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      name="interval_value"
                      id="e_interval_value"
                      min={1}
                      value={intervalValue}
                      onChange={(e) => setIntervalValue(e.target.value)}
                      className={`flex-1 min-w-0 ${inputCls}`}
                    />
                    <select
                      name="interval_unit"
                      id="e_interval_unit"
                      value={intervalUnit}
                      onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                      className={`flex-1 min-w-0 ${inputCls}`}
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
                  <label htmlFor="e_time" className={labelCls}>
                    At time
                  </label>
                  <input
                    type="time"
                    name="time"
                    id="e_time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {frequency === "weekly" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="e_day_of_week" className={labelCls}>
                      On day
                    </label>
                    <select
                      name="day_of_week"
                      id="e_day_of_week"
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
                      className={inputCls}
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

          <div className="h-px w-full bg-outline-variant/30" />

          <div className="flex flex-col-reverse md:flex-row md:items-center gap-3 md:gap-4">
            <div className="flex gap-2 md:ml-auto">
              <Link href="/schedules" className="inline-flex">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !macroId}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                {submitting ? "Saving\u2026" : "Update Schedule"}
              </Button>
            </div>
            <div className="flex items-center gap-2 md:mr-auto">
              <span className={labelCls}>Cron</span>
              <code className="px-3 py-1.5 font-mono text-sm rounded-[var(--radius-button)] min-w-0 truncate bg-surface-container-lowest text-primary border border-outline-variant/30">
                {cronPreview}
              </code>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
