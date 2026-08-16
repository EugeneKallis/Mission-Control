"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { ArrConfigSection } from "@/components/config/arr-config-section";
import { ARR_INSTANCE_DEFINITIONS, arrConfigDbKey } from "@/lib/arr-config";

// ── Style helpers (consistent with existing page) ─────────────────────────

const cardStyle = {
  background: "var(--color-surface-container)",
  border: "1px solid var(--color-border)",
} as const;

const inputClass =
  "w-full bg-surface border border-outline-variant/40 rounded-[var(--radius-button)] px-3 py-2 text-sm font-mono text-on-surface outline-none focus:border-primary transition-colors";

const labelClass = "block text-sm font-medium text-on-surface mb-2";

// ── Page component ────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [apiKey, setApiKey] = useState("");
  const [pulseApiKey, setPulseApiKey] = useState("");
  const [plexToken, setPlexToken] = useState("");
  const [plexUrl, setPlexUrl] = useState("");
  const [arrValues, setArrValues] = useState<Record<string, { url: string; apiKey: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [rdStatus, setRdStatus] = useState<{ label: string; ok: boolean } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load config");
        return r.json();
      })
      .then((data) => {
        setApiKey(data.real_debrid_api_key || "");
        setPulseApiKey(data.pulse_api_key || "");
        setPlexToken(data.plex_token || "");
        setPlexUrl(data.plex_url || "");

        // Load arr instance values from DB
        const arr: Record<string, { url: string; apiKey: string }> = {};
        for (const def of ARR_INSTANCE_DEFINITIONS) {
          arr[def.name] = {
            url: data[arrConfigDbKey(def.slug, "url")] || "",
            apiKey: data[arrConfigDbKey(def.slug, "api_key")] || "",
          };
        }
        setArrValues(arr);
        setHasChanges(false);

        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/real-debrid/status")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data) setRdStatus(data);
      })
      .catch(() => setRdStatus({ label: "Offline", ok: false }));
  }, []);

  const handleArrFieldChange = useCallback(
    (name: string, field: "url" | "apiKey", value: string) => {
      setArrValues((prev) => ({
        ...prev,
        [name]: { ...prev[name], [field]: value },
      }));
      setHasChanges(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        real_debrid_api_key: apiKey,
        pulse_api_key: pulseApiKey,
        plex_token: plexToken,
        plex_url: plexUrl,
      };

      for (const def of ARR_INSTANCE_DEFINITIONS) {
        payload[arrConfigDbKey(def.slug, "url")] = arrValues[def.name]?.url ?? "";
        payload[arrConfigDbKey(def.slug, "api_key")] = arrValues[def.name]?.apiKey ?? "";
      }

      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setHasChanges(false);
      showToast("Config saved", "success");

      // Refresh status
      const statusRes = await fetch("/api/real-debrid/status");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setRdStatus(statusData);
      }
    } catch {
      showToast("Failed to save config", "error");
    } finally {
      setSaving(false);
    }
  }, [apiKey, pulseApiKey, plexToken, plexUrl, arrValues, showToast]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto stagger-1">
        <h1
          className="text-2xl font-bold mb-1 tracking-tight text-[var(--color-on-surface)]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Config
        </h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mb-8">Global application configuration</p>

        {loading ? (
          <div className="text-center py-16 text-[var(--color-on-surface-variant)]">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* ── Pulse ─────────────────────────────────────────────────── */}
            <div className="p-4 md:p-6 rounded-lg" style={cardStyle}>
              <h2 className="text-sm font-semibold text-[var(--color-on-surface)] mb-4">Pulse</h2>
              <label htmlFor="pulse-api-key" className={labelClass}>Pulse API Key</label>
              <input
                id="pulse-api-key"
                type="password"
                className={inputClass}
                placeholder="Enter your Pulse API key"
                value={pulseApiKey}
                onChange={(e) => {
                  setPulseApiKey(e.target.value);
                  setHasChanges(true);
                }}
              />
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-2">
                Generate a read-only token in Pulse&apos;s API Access settings. Mission Control sends it through Pulse&apos;s <code className="text-primary">X-API-Token</code> header.
              </p>
            </div>

            {/* ── Plex ──────────────────────────────────────────────────── */}
            <div className="p-4 md:p-6 rounded-lg" style={cardStyle}>
              <h2 className="text-sm font-semibold text-[var(--color-on-surface)] mb-4">Plex</h2>

              <label className={labelClass}>Plex Token</label>
              <input
                type="password"
                className={inputClass}
                placeholder="Enter your Plex authentication token"
                value={plexToken}
                onChange={(e) => {
                  setPlexToken(e.target.value);
                  setHasChanges(true);
                }}
              />
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-3">
                Can be obtained via the token extractor script:&nbsp;
                <code className="text-primary">just script scripts/plex/plex-token-extractor.ts</code>
              </p>

              <label className={`${labelClass} mt-4`}>Plex Server URL</label>
              <input
                type="url"
                className={inputClass}
                placeholder="http://192.168.1.x:32400"
                value={plexUrl}
                onChange={(e) => {
                  setPlexUrl(e.target.value);
                  setHasChanges(true);
                }}
              />
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-2">
                Local Plex server address including port (e.g. http://192.168.1.100:32400).
              </p>
            </div>

            {/* ── Real-Debrid ───────────────────────────────────────────── */}
            <div className="p-4 md:p-6 rounded-lg" style={cardStyle}>
              <label className={labelClass}>Real Debrid API Key</label>
              <input
                type="password"
                className={inputClass}
                placeholder="Enter your Real-Debrid API key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setHasChanges(true);
                }}
              />
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-2">
                Found in your Real-Debrid account under &quot;API Token&quot;.
              </p>
            </div>

            {/* ── Status Badge ──────────────────────────────────────────── */}
            {rdStatus && (
              <div
                className="flex items-center gap-3 p-3 rounded-lg text-sm"
                style={{
                  background: "rgba(32, 31, 31, 0.8)",
                  border: `1px solid ${rdStatus.ok ? "var(--status-success-border)" : "var(--status-failed-border)"}`,
                }}
              >
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${rdStatus.ok ? "bg-success" : "bg-error"}`}
                />
                <span className={rdStatus.ok ? "text-success" : "text-error"}>
                  Real-Debrid: {rdStatus.label}
                </span>
              </div>
            )}

            {/* ── Arr Instances ─────────────────────────────────────────── */}
            <ArrConfigSection
              values={arrValues}
              onChange={handleArrFieldChange}
            />

          </div>
        )}

        {hasChanges && !loading && (
          <div className="fixed bottom-5 right-5 z-50">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              className="shadow-lg"
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
