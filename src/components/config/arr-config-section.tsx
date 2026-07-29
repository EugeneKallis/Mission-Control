/**
 * Arr configuration section for the Config page.
 *
 * Renders the ten built-in Radarr/Sonarr instance URL and API-key fields
 * from canonical definitions, plus a bulk-import textarea that uses the
 * pure parser from src/lib/arr-config.ts.
 *
 * Shows default URLs when no stored value exists, and explains
 * env-over-website precedence.
 */

"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import {
  ARR_INSTANCE_DEFINITIONS,
  parseArrImport,
  type ArrImportIssue,
} from "@/lib/arr-config";

// ── Style helpers ─────────────────────────────────────────────────────────

const inputClass =
  "w-full bg-[var(--color-surface)] border border-[var(--color-outline-variant)] rounded px-3 py-2 text-sm font-mono text-[var(--color-on-surface)] outline-none focus:border-[var(--color-success)] transition-colors";

const labelClass = "block text-sm font-medium text-[var(--color-on-surface)] mb-2";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ArrFieldValues {
  url: string;
  apiKey: string;
}

interface ArrConfigSectionProps {
  /** Current values keyed by canonical name (e.g. "Radarr") */
  values: Record<string, ArrFieldValues>;
  /** Called when any field changes */
  onChange: (name: string, field: "url" | "apiKey", value: string) => void;
}

// ── Sub-component ─────────────────────────────────────────────────────────

function ArrInstanceCard({
  name,
  url,
  apiKey,
  defaultUrl,
  onFieldChange,
}: {
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

      <label className="block text-xs text-[var(--color-on-surface-variant)] mb-1">URL</label>
      <input
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

      <label className="block text-xs text-[var(--color-on-surface-variant)] mb-1">API Key</label>
      <input
        type="password"
        className="w-full bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)] rounded px-2 py-1.5 text-xs font-mono text-[var(--color-on-surface)] outline-none focus:border-[var(--color-success)] transition-colors"
        placeholder="Enter API key"
        value={apiKey}
        onChange={(e) => onFieldChange("apiKey", e.target.value)}
      />
    </div>
  );
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

// ── Main component ────────────────────────────────────────────────────────

export function ArrConfigSection({ values, onChange }: ArrConfigSectionProps) {
  const [importText, setImportText] = useState("");
  const [importIssues, setImportIssues] = useState<ArrImportIssue[]>([]);
  const { showToast } = useToast();

  const handleParseImport = useCallback(() => {
    const result = parseArrImport(importText);
    setImportIssues(result.issues);

    if (result.entries.length > 0) {
      for (const entry of result.entries) {
        onChange(entry.name, "url", entry.url);
        onChange(entry.name, "apiKey", entry.apiKey);
      }
      showToast(`Parsed ${result.entries.length} instance(s)`, "success");
    }

    if (result.entries.length === 0 && result.issues.length > 0) {
      showToast("No valid instances found", "error");
    }
  }, [importText, onChange, showToast]);

  const handleClearImport = useCallback(() => {
    setImportText("");
    setImportIssues([]);
  }, []);

  // Separate radarr and sonarr for the two-column grid
  const radarrInstances = ARR_INSTANCE_DEFINITIONS.filter((d) => d.type === "radarr");
  const sonarrInstances = ARR_INSTANCE_DEFINITIONS.filter((d) => d.type === "sonarr");

  return (
    <div
      className="p-4 md:p-6 rounded-lg"
      style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-border)" }}
    >
      <h2 className="text-sm font-semibold text-[var(--color-on-surface)] mb-4">
        Arr Instances
      </h2>
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
            <p
              key={i}
              className="text-xs"
              style={{ color: issueColor(issue.type) }}
            >
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
            name={def.name}
            url={values[def.name]?.url ?? ""}
            apiKey={values[def.name]?.apiKey ?? ""}
            defaultUrl={def.defaultUrl}
            onFieldChange={(field, val) => onChange(def.name, field, val)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {sonarrInstances.map((def) => (
          <ArrInstanceCard
            key={def.slug}
            name={def.name}
            url={values[def.name]?.url ?? ""}
            apiKey={values[def.name]?.apiKey ?? ""}
            defaultUrl={def.defaultUrl}
            onFieldChange={(field, val) => onChange(def.name, field, val)}
          />
        ))}
      </div>
    </div>
  );
}
