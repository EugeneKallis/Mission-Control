"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { PveThresholds } from "@/lib/pve-alerts";

interface PveThresholdsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm: PveThresholds = {
  cpu: 80,
  memory: 80,
  storage: 80,
};

export function PveThresholdsModal({ open, onClose, onSaved }: PveThresholdsModalProps) {
  const [form, setForm] = useState<PveThresholds>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/pve/thresholds")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        const data = (await res.json()) as { config: PveThresholds };
        setForm(data.config);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pve/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof PveThresholds, value: string) => {
    const num = parseInt(value, 10);
    setForm((prev) => ({ ...prev, [key]: Number.isNaN(num) ? prev[key] : Math.max(1, Math.min(100, num)) }));
  };

  return (
    <Modal open={open} onClose={onClose} title="Thresholds" icon="monitoring">
      <div className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-[var(--radius-button)] text-sm text-error bg-error/10 border border-error/30">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-on-surface-variant py-4 text-center">Loading thresholds…</div>
        ) : (
          <div className="space-y-4" role="form" aria-label="Proxmox utilization thresholds">
            <p className="text-xs text-on-surface-variant">
              Highlight resources when utilization is <span className="font-semibold text-on-surface">strictly greater</span> than the configured threshold.
            </p>
            {[
              { key: "cpu" as const, label: "CPU", suffix: "%" },
              { key: "memory" as const, label: "Memory", suffix: "%" },
              { key: "storage" as const, label: "Storage", suffix: "%" },
            ].map(({ key, label, suffix }) => (
              <div key={key}>
                <label htmlFor={`pve-threshold-${key}`} className="block text-xs text-on-surface-variant mb-1">
                  {label} threshold
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`pve-threshold-${key}`}
                    type="number"
                    min={1}
                    max={100}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    className="w-24 px-3 py-2 bg-bg border border-outline-variant/40 rounded-[var(--radius-button)] text-sm text-on-surface outline-none focus:border-primary transition-colors"
                  />
                  <span className="text-sm text-on-surface-variant">{suffix}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors rounded-[var(--radius-button)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 bg-primary text-on-primary hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium rounded-[var(--radius-button)] transition-all duration-200 active:scale-[0.98]"
          >
            {saving ? "Saving…" : "Save Thresholds"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
