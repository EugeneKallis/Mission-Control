"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { ArrConfigSection } from "@/components/config/arr-config-section";
import { ARR_INSTANCE_DEFINITIONS, arrConfigDbKey } from "@/lib/arr-config";
import {
  configSections,
  defaultConfigValues,
  type ConfigFieldDefinition,
  type ConfigKey,
} from "@/lib/config-fields";

const cardStyle = {
  background: "var(--color-surface-container)",
  border: "1px solid var(--color-border)",
} as const;

const inputClass =
  "w-full bg-surface border border-outline-variant/40 rounded-[var(--radius-button)] px-3 py-2 text-sm font-mono text-on-surface outline-none focus:border-primary transition-colors";
const labelClass = "block text-sm font-medium text-on-surface mb-2";
const sections = configSections();

function ConfigField({ field, value, onChange }: { field: ConfigFieldDefinition; value: string; onChange: (value: string) => void }) {
  const id = `config-${field.key}`;
  const common = { id, className: inputClass, value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) };

  return (
    <div>
      <label htmlFor={id} className={labelClass}>{field.label}</label>
      {field.kind === "textarea" ? (
        <textarea {...common} rows={3} placeholder={field.placeholder} />
      ) : field.kind === "boolean" ? (
        <select {...common}>
          <option value="false">Disabled</option>
          <option value="true">Enabled</option>
        </select>
      ) : (
        <input
          {...common}
          type={field.kind === "secret" ? "password" : field.kind === "url" ? "url" : field.kind === "date" ? "date" : field.kind === "integer" || field.kind === "number" ? "number" : "text"}
          step={field.kind === "number" ? "any" : undefined}
          min={field.kind === "integer" ? "1" : undefined}
          placeholder={field.placeholder}
        />
      )}
      <p className="mt-2 text-xs text-on-surface-variant">{field.description}</p>
    </div>
  );
}

export default function ConfigPage() {
  const [values, setValues] = useState<Record<ConfigKey, string>>(defaultConfigValues);
  const [arrValues, setArrValues] = useState<Record<string, { url: string; apiKey: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [rdStatus, setRdStatus] = useState<{ label: string; ok: boolean } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/config")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load config");
        return response.json() as Promise<Record<string, string>>;
      })
      .then((data) => {
        setValues((current) => Object.fromEntries(Object.keys(current).map((key) => [key, data[key] ?? current[key as ConfigKey]])) as Record<ConfigKey, string>);

        const arr: Record<string, { url: string; apiKey: string }> = {};
        for (const def of ARR_INSTANCE_DEFINITIONS) {
          arr[def.name] = {
            url: data[arrConfigDbKey(def.slug, "url")] || "",
            apiKey: data[arrConfigDbKey(def.slug, "api_key")] || "",
          };
        }
        setArrValues(arr);
        setHasChanges(false);
      })
      .catch(() => showToast("Failed to load config", "error"))
      .finally(() => setLoading(false));

    fetch("/api/real-debrid/status")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setRdStatus(data); })
      .catch(() => setRdStatus({ label: "Offline", ok: false }));
  }, [showToast]);

  const setField = useCallback((key: ConfigKey, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleArrFieldChange = useCallback((name: string, field: "url" | "apiKey", value: string) => {
    setArrValues((current) => ({ ...current, [name]: { ...current[name], [field]: value } }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = { ...values };
      for (const def of ARR_INSTANCE_DEFINITIONS) {
        payload[arrConfigDbKey(def.slug, "url")] = arrValues[def.name]?.url ?? "";
        payload[arrConfigDbKey(def.slug, "api_key")] = arrValues[def.name]?.apiKey ?? "";
      }

      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Save failed");
      setHasChanges(false);
      showToast("Config saved", "success");

      const statusResponse = await fetch("/api/real-debrid/status");
      if (statusResponse.ok) setRdStatus(await statusResponse.json());
    } catch {
      showToast("Failed to save config", "error");
    } finally {
      setSaving(false);
    }
  }, [arrValues, showToast, values]);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-4 stagger-1 md:p-6">
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-on-surface" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>Config</h1>
        <p className="mb-8 text-sm text-on-surface-variant">Global application configuration for current and planned Mission Control features.</p>

        {loading ? (
          <div className="py-16 text-center text-on-surface-variant">Loading...</div>
        ) : (
          <div className="space-y-6">
            {sections.map((section, index) => (
              <details key={section.name} open={index === 0} className="rounded-lg" style={cardStyle}>
                <summary className="cursor-pointer list-none px-4 py-4 md:px-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-on-surface">{section.name}</h2>
                    <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
                  </div>
                </summary>
                <div className="grid gap-5 border-t border-outline-variant/30 px-4 py-5 md:grid-cols-2 md:px-6">
                  {section.fields.map((field) => (
                    <ConfigField key={field.key} field={field} value={values[field.key as ConfigKey]} onChange={(value) => setField(field.key as ConfigKey, value)} />
                  ))}
                </div>
              </details>
            ))}

            {rdStatus && (
              <div className="flex items-center gap-3 rounded-lg p-3 text-sm" style={{ background: "rgba(32, 31, 31, 0.8)", border: `1px solid ${rdStatus.ok ? "var(--status-success-border)" : "var(--status-failed-border)"}` }}>
                <div className={`h-2 w-2 shrink-0 rounded-full ${rdStatus.ok ? "bg-success" : "bg-error"}`} />
                <span className={rdStatus.ok ? "text-success" : "text-error"}>Real-Debrid: {rdStatus.label}</span>
              </div>
            )}

            <ArrConfigSection values={arrValues} onChange={handleArrFieldChange} />

            <section className="rounded-lg p-4 md:p-6" style={cardStyle}>
              <h2 className="mb-2 text-sm font-semibold text-on-surface">Managed configuration</h2>
              <p className="mb-4 text-xs text-on-surface-variant">Repeatable records and security-sensitive controls stay with the feature that owns them.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link href="/pve" className="rounded-[var(--radius-button)] border border-outline-variant/30 p-3 text-sm text-primary hover:bg-surface">Proxmox endpoints and SSH maps</Link>
                <Link href="/operations" className="rounded-[var(--radius-button)] border border-outline-variant/30 p-3 text-sm text-primary hover:bg-surface">Backups, AdGuard, TLS and maintenance</Link>
                <Link href="/pi-settings" className="rounded-[var(--radius-button)] border border-outline-variant/30 p-3 text-sm text-primary hover:bg-surface">Pi tools, skills and providers</Link>
                <Link href="/schedules" className="rounded-[var(--radius-button)] border border-outline-variant/30 p-3 text-sm text-primary hover:bg-surface">Schedules and worker timers</Link>
              </div>
            </section>
          </div>
        )}
      </div>

      {hasChanges && !loading && (
        <div className="fixed bottom-5 right-5 z-50">
          <Button variant="primary" onClick={handleSave} disabled={saving} className="shadow-lg">{saving ? "Saving..." : "Save changes"}</Button>
        </div>
      )}
    </AppShell>
  );
}
