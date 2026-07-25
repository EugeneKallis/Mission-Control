"use client";

import { useState, useCallback } from "react";
import type { PveEndpointConfig } from "./proxmox-types";

interface EndpointSettingsProps {
  endpoints: PveEndpointConfig[];
  onRefresh: () => void;
}

interface EndpointFormData {
  name: string;
  apiUrl: string;
  apiToken: string;
  verifyTls: boolean;
  enabled: boolean;
}

const emptyForm: EndpointFormData = {
  name: "",
  apiUrl: "",
  apiToken: "",
  verifyTls: false,
  enabled: true,
};

export function EndpointSettings({ endpoints, onRefresh }: EndpointSettingsProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number } & EndpointFormData | null>(null);
  const [form, setForm] = useState<EndpointFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setForm(emptyForm);
    setEditing(null);
    setError(null);
  }, []);

  const startCreate = useCallback(() => {
    resetForm();
    setOpen(true);
  }, [resetForm]);

  const startEdit = useCallback(async (ep: PveEndpointConfig) => {
    let fullToken = "";
    try {
      const res = await fetch(`/api/pve/endpoints/${ep.id}`);
      if (res.ok) {
        const data = await res.json();
        fullToken = data.apiToken || "";
      }
    } catch {
      // fallback to masked token
    }
    setForm({
      name: ep.name,
      apiUrl: ep.apiUrl,
      apiToken: fullToken,
      verifyTls: ep.verifyTls,
      enabled: ep.enabled,
    });
    setEditing({ ...ep, apiToken: fullToken, id: ep.id });
    setError(null);
    setOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        // Update
        const payload: Record<string, unknown> = {
          name: form.name,
          apiUrl: form.apiUrl,
          verifyTls: form.verifyTls,
          enabled: form.enabled,
        };
        if (form.apiToken.length > 0) payload.apiToken = form.apiToken;

        const res = await fetch(`/api/pve/endpoints/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
      } else {
        // Create
        const res = await fetch("/api/pve/endpoints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
      }
      setOpen(false);
      resetForm();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [editing, form, onRefresh, resetForm]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this Proxmox endpoint?")) return;
    try {
      const res = await fetch(`/api/pve/endpoints/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setOpen(false);
      resetForm();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [onRefresh, resetForm]);

  return (
    <div>
      {/* Header row with Add Server button top-right */}
      {endpoints.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">{endpoints.length} server{endpoints.length !== 1 ? "s" : ""} configured</span>
          <button
            onClick={startCreate}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Server
          </button>
        </div>
      )}

      {/* Server grid */}
      {endpoints.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {endpoints.map((ep) => (
            <div
              key={ep.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                ep.enabled
                  ? "bg-gray-800/60 border-gray-700/50"
                  : "bg-gray-800/20 border-gray-700/20 opacity-60"
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ep.enabled ? "bg-green-500" : "bg-gray-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{ep.name}</div>
                <div className="text-gray-500 text-xs truncate font-mono">{ep.apiUrl.replace(/^https?:\/\//, "")}</div>
              </div>
              <button
                onClick={() => startEdit(ep)}
                className="text-gray-500 hover:text-blue-400 transition-colors shrink-0"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button
          onClick={startCreate}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Server
        </button>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setOpen(false); resetForm(); }}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editing ? `Edit: ${editing.name}` : "Add Proxmox Server"}</h3>

            {error && (
              <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Main Cluster"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">API URL</label>
                <input
                  className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="https://192.168.1.10:8006"
                  value={form.apiUrl}
                  onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  API Token {editing && <span className="text-gray-500">(leave blank to keep current)</span>}
                </label>
                <textarea
                  className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
                  placeholder={editing ? "········" : "root@pam!monitor=xxx"}
                  rows={2}
                  value={form.apiToken}
                  onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                    checked={form.verifyTls}
                    onChange={(e) => setForm({ ...form, verifyTls: e.target.checked })}
                  />
                  <span className="text-sm text-gray-300">Verify TLS</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  <span className="text-sm text-gray-300">Enabled</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6">
              {editing && (
                <button
                  onClick={() => handleDelete(editing.id)}
                  className="px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => { setOpen(false); resetForm(); }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.apiUrl || (!editing && !form.apiToken)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? "Saving…" : editing ? "Save Changes" : "Add Server"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
