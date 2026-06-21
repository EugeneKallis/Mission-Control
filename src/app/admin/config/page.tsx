"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

export default function ConfigPage() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rdStatus, setRdStatus] = useState<{ label: string; ok: boolean } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setApiKey(data.real_debrid_api_key || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/real-debrid/status")
      .then((r) => r.json())
      .then((data) => setRdStatus(data))
      .catch(() => setRdStatus({ label: "Offline", ok: false }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ real_debrid_api_key: apiKey }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast("Config saved", "success");

      // Refresh status
      const statusRes = await fetch("/api/real-debrid/status");
      const statusData = await statusRes.json();
      setRdStatus(statusData);
    } catch {
      showToast("Failed to save config", "error");
    } finally {
      setSaving(false);
    }
  }, [apiKey, showToast]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-2xl mx-auto stagger-1">
        <h1 className="text-2xl font-bold mb-1 tracking-tight text-[#E5E2E1]" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Config
        </h1>
        <p className="text-sm text-[#849587] mb-8">Global application configuration</p>

        {loading ? (
          <div className="text-center py-16 text-[#849587]">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Real-Debrid API Key */}
            <div
              className="p-4 md:p-6 rounded-lg"
              style={{ background: "#201F1F", border: "1px solid rgba(59, 75, 63, 0.3)" }}
            >
              <label className="block text-sm font-medium text-[#E5E2E1] mb-2">
                Real Debrid API Key
              </label>
              <input
                type="password"
                className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm font-mono text-[#E5E2E1] outline-none focus:border-[#618B6B] transition-colors"
                placeholder="Enter your Real-Debrid API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-[#849587] mt-2">
                Found in your Real-Debrid account under &quot;API Token&quot;.
              </p>
            </div>

            {/* Status Badge */}
            {rdStatus && (
              <div
                className="flex items-center gap-3 p-3 rounded-lg text-sm"
                style={{
                  background: "rgba(32, 31, 31, 0.8)",
                  border: `1px solid ${rdStatus.ok ? "rgba(97, 139, 107, 0.3)" : "rgba(255, 180, 171, 0.3)"}`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: rdStatus.ok ? "#618B6B" : "#FFB4AB" }}
                />
                <span style={{ color: rdStatus.ok ? "#618B6B" : "#FFB4AB" }}>
                  Real-Debrid: {rdStatus.label}
                </span>
              </div>
            )}

            {/* Save */}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
