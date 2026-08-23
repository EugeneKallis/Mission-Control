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

interface EditTimerFormProps {
  timerId: number;
  timerName: string;
  workerPath: string;
  initialEnabled: boolean;
  initialValues: ScheduleFormValues;
}

const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant";
const inputCls =
  "w-full px-3 py-2 text-sm text-on-surface outline-none transition-colors rounded-[var(--radius-button)] focus:border-b-primary bg-surface-container-high/50 border border-outline-variant/30 focus:border-primary";

/**
 * Edit form for worker timers. Mirrors the macro schedule edit form.
 */
export function EditTimerForm({
  timerId,
  timerName,
  workerPath,
  initialEnabled,
  initialValues,
}: EditTimerFormProps) {
  const toast = useToast();
  const router = useRouter();
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
    setSubmitting(true);
    try {
      const cronExpression = buildCronExpression(currentValues);
      const res = await fetch(`/api/schedules/timers/${timerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronExpression }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.showToast("Timer updated", "success");
      router.push("/schedules");
      router.refresh();
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : "Failed to update timer",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 stagger-1 p-4 md:p-6 w-full">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 min-w-0">
        <Link href="/schedules" aria-label="Back to schedules">
          <Button variant="ghost">
            <span className="material-symbols-outlined">arrow_back</span>
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface tracking-tight font-display">
          Edit Timer
        </h1>
        <span className="max-w-full truncate text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-[var(--radius-pill)] bg-primary/15 text-primary">
          {timerName}
        </span>
        {!initialEnabled && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-[var(--radius-pill)] bg-on-surface-variant/20 text-on-surface-variant">
            Currently disabled
          </span>
        )}
      </div>

      <div className="p-6 rounded-[var(--radius-card)] bg-surface border border-outline-variant/30">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Worker info (read-only) */}
          <div className="grid grid-cols-1 gap-1.5">
            <label className={labelCls}>Worker</label>
            <div className="px-3 py-2 text-sm text-on-surface-variant rounded-[var(--radius-button)] bg-surface-container-high/50 border border-outline-variant/30">
              <span className="font-mono text-xs">{workerPath}</span>
            </div>
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
                  <label htmlFor="t_interval_value" className={labelCls}>
                    Every
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      name="interval_value"
                      id="t_interval_value"
                      min={1}
                      value={intervalValue}
                      onChange={(e) => setIntervalValue(e.target.value)}
                      className={`flex-1 min-w-0 ${inputCls}`}
                    />
                    <select
                      name="interval_unit"
                      id="t_interval_unit"
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
                  <label htmlFor="t_time" className={labelCls}>
                    At time
                  </label>
                  <input
                    type="time"
                    name="time"
                    id="t_time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {frequency === "weekly" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="t_day_of_week" className={labelCls}>
                      On day
                    </label>
                    <select
                      name="day_of_week"
                      id="t_day_of_week"
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
                disabled={submitting}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                {submitting ? "Saving\u2026" : "Update Timer"}
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
