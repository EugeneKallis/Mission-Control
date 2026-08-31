"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast-provider";
import {
  ARR_INSTANCE_DEFINITIONS,
  arrConfigDbKey,
  parseArrImport,
  type ArrImportIssue,
} from "@/lib/arr-config";

// ── Style helpers ─────────────────────────────────────────────────────────

const inputClass =
  "w-full bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded px-3 py-2 text-sm font-mono text-[var(--color-on-surface)] outline-none focus:border-[var(--color-success)] transition-colors";

const labelClass = "block text-sm font-medium text-[var(--color-on-surface)] mb-2";

interface ArrFieldValues {
  url: string;
  apiKey: string;
}

// ── Issue display helpers ─────────────────────────────────────────────────

const ISSUE_COLORS: Record<string, string> = {
  unknown_name: "#FFB4AB",
  invalid_url: "#FFB4AB",
  incomplete_record: "#FFD68A",
  duplicate_name: "#FFD68A",
};

function issueColor(type: ArrImportIssue["type"]): string {
  return ISSUE_COLORS[type] ?? "#FFB4AB";
}

// ── Sub-component ─────────────────────────────────────────────────────────

function ArrInstanceCard({
  slug,
  name,
  url,
  apiKey,
  defaultUrl,
  onFieldChange,
}: {
  slug: string;
  name: string;
  url: string;
  apiKey: string;
  defaultUrl: string;
  onFieldChange: (field: "url" | "apiKey", value: string) => void;
}) {
  return (
    <div
      className="p-3 rounded-lg"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <h3 className="text-sm font-semibold text-[var(--color-on-surface)] mb-3">{name}</h3>

      <label htmlFor={`arr-${slug}-url`} className="block text-xs text-[var(--color-on-surface-variant)] mb-1">URL</label>
      <input
        id={`arr-${slug}-url`}
        aria-label={`${name} URL`}
        type="url"
        className="w-full bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded px-2 py-1.5 text-xs font-mono text-[var(--color-on-surface)] outline-none focus:border-[var(--color-success)] transition-colors mb-1"
        placeholder={defaultUrl}
        value={url}
        onChange={(e) => onFieldChange("url", e.target.value)}
      />
      {!url && (
        <p className="text-[10px] text-[var(--color-success)] mb-2">
          Default: {defaultUrl}
        </p>
      )}

      <label htmlFor={`arr-${slug}-api-key`} className="block text-xs text-[var(--color-on-surface-variant)] mb-1">API Key</label>
      <input
        id={`arr-${slug}-api-key`}
        aria-label={`${name} API Key`}
        type="password"
        className="w-full bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded px-2 py-1.5 text-xs font-mono text-[var(--color-on-surface)] outline-none focus:border-[var(--color-success)] transition-colors"
        placeholder="Enter API key"
        value={apiKey}
        onChange={(e) => onFieldChange("apiKey", e.target.value)}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function ArrConfigModal({ onClose }: { onClose: () => void }) {
  const [arrValues, setArrValues] = useState<Record<string, ArrFieldValues>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importText, setImportText] = useState("");
  const [importIssues, setImportIssues] = useState<ArrImportIssue[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/config")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load config");
        return response.json() as Promise<Record<string, string>>;
      })
      .then((data) => {
        const arr: Record<string, ArrFieldValues> = {};
        for (const def of ARR_INSTANCE_DEFINITIONS) {
          arr[def.name] = {
            url: data[arrConfigDbKey(def.slug, "url")] || "",
            apiKey: data[arrConfigDbKey(def.slug, "api_key")] || "",
          };
        }
        setArrValues(arr);
      })
      .catch(() => {
        setLoadFailed(true);
        showToast("Failed to load config", "error");
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  const handleArrFieldChange = useCallback((name: string, field: "url" | "apiKey", value: string) => {
    setArrValues((current) => ({ ...current, [name]: { ...current[name], [field]: value } }));
  }, []);

  const handleParseImport = useCallback(() => {
    const result = parseArrImport(importText);
    setImportIssues(result.issues);

    if (result.entries.length > 0) {
      for (const entry of result.entries) {
        handleArrFieldChange(entry.name, "url", entry.url);
        handleArrFieldChange(entry.name, "apiKey", entry.apiKey);
      }
      showToast(`Parsed ${result.entries.length} instance(s)`, "success");
    }

    if (result.entries.length === 0 && result.issues.length > 0) {
      showToast("No valid instances found", "error");
    }
  }, [handleArrFieldChange, importText, showToast]);

  const handleClearImport = useCallback(() => {
    setImportText("");
    setImportIssues([]);
  }, []);

  const handleSave = useCallback(async () => {
    if (loadFailed) return; // never persist a blanked form from a failed load
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
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
      showToast("Settings saved", "success");
      onClose();
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }, [arrValues, loadFailed, onClose, showToast]);

  // Separate radarr and sonarr for the two-column grid
  const radarrInstances = ARR_INSTANCE_DEFINITIONS.filter((d) => d.type === "radarr");
  const sonarrInstances = ARR_INSTANCE_DEFINITIONS.filter((d) => d.type === "sonarr");

  return (
    <Modal
      open
      onClose={onClose}
      title="Arr Instances"
      icon="dns"
      className="max-w-3xl"
      actions={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || loading || loadFailed}>{saving ? "Saving..." : "Save"}</Button>
        </>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-on-surface-variant">Loading...</div>
      ) : loadFailed ? (
        <div className="py-8 text-center text-on-surface-variant">Couldn&apos;t load settings. Close and try again.</div>
      ) : (
        <>
          <p className="text-xs text-[var(--color-on-surface-variant)] mb-4">
            Configure API keys and URLs for all Sonarr / Radarr instances.
            Values set here are stored in the database. Environment variables
            (<code className="text-[var(--color-success)]">ARR__&lt;NAME&gt;__URL</code>,{" "}
            <code className="text-[var(--color-success)]">ARR__&lt;NAME&gt;__API_KEY</code>)
            take precedence over stored values.
          </p>

          {/* Bulk import */}
          <label className={`${labelClass} text-[var(--color-on-surface-variant)]`}>
            Bulk Import
          </label>
          <p className="text-xs text-[var(--color-on-surface-variant)] mb-2">
            Paste one record per instance in the format: name / url / api_key
            (3 lines per record). Blank-line separators are optional.
          </p>
          <textarea
            className={`${inputClass} min-h-[140px] resize-y`}
            placeholder={
              "radarr\nhttp://192.168.1.111:7878\nreplace-with-radarr-api-key\n\nradarr4k\nhttp://192.168.1.111:7879\nreplace-with-radarr4k-api-key"
            }
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportIssues([]);
            }}
          />

          {/* Structured issues */}
          {importIssues.length > 0 && (
            <div className="mt-3 space-y-1">
              {importIssues.map((issue, i) => (
                <p key={i} className="text-xs" style={{ color: issueColor(issue.type) }}>
                  {issue.message}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <Button onClick={handleParseImport} disabled={!importText.trim()}>
              Parse &amp; Fill
            </Button>
            <Button variant="ghost" onClick={handleClearImport}>
              Clear
            </Button>
          </div>

          {/* Per-instance fields */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            {radarrInstances.map((def) => (
              <ArrInstanceCard
                key={def.slug}
                slug={def.slug}
                name={def.name}
                url={arrValues[def.name]?.url ?? ""}
                apiKey={arrValues[def.name]?.apiKey ?? ""}
                defaultUrl={def.defaultUrl}
                onFieldChange={(field, val) => handleArrFieldChange(def.name, field, val)}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {sonarrInstances.map((def) => (
              <ArrInstanceCard
                key={def.slug}
                slug={def.slug}
                name={def.name}
                url={arrValues[def.name]?.url ?? ""}
                apiKey={arrValues[def.name]?.apiKey ?? ""}
                defaultUrl={def.defaultUrl}
                onFieldChange={(field, val) => handleArrFieldChange(def.name, field, val)}
              />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
