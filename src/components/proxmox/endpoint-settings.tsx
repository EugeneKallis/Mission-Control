"use client";

import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import type { PveEndpointConfig } from "./proxmox-types";

interface EndpointSettingsProps {
  endpoints: PveEndpointConfig[];
  onClose: () => void;
  onSaved: () => void;
}

interface EndpointFormData {
  name: string;
  apiUrl: string;
  apiToken: string;
  sshTargetMap: string;
  verifyTls: boolean;
  enabled: boolean;
}

const emptyForm: EndpointFormData = {
  name: "",
  apiUrl: "",
  apiToken: "",
  sshTargetMap: "",
  verifyTls: false,
  enabled: true,
};

export function EndpointSettings({ endpoints, onClose, onSaved }: EndpointSettingsProps) {
  const [editing, setEditing] = useState<{ id: number } & EndpointFormData | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EndpointFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setForm(emptyForm);
    setEditing(null);
    setCreating(false);
    setError(null);
  }, []);

  const startCreate = useCallback(() => {
    setForm(emptyForm);
    setEditing(null);
    setCreating(true);
    setError(null);
  }, []);

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
      sshTargetMap: ep.sshTargetMap,
      verifyTls: ep.verifyTls,
      enabled: ep.enabled,
    });
    setEditing({ ...ep, apiToken: fullToken, id: ep.id });
    setCreating(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          name: form.name,
          apiUrl: form.apiUrl,
          sshTargetMap: form.sshTargetMap,
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
      resetForm();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [editing, form, onSaved, resetForm]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this Proxmox endpoint?")) return;
    try {
      const res = await fetch(`/api/pve/endpoints/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      resetForm();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [onSaved, resetForm]);

  return (
    <Modal open onClose={onClose} title="Proxmox Servers" icon="dns">
      <div className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-[var(--radius-button)] text-sm text-error bg-error/10 border border-error/30">{error}</div>
        )}

        {/* Server list */}
        {endpoints.length > 0 && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-on-surface-variant">{endpoints.length} server{endpoints.length !== 1 ? "s" : ""} configured</span>
            <button
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-primary text-on-primary hover:bg-primary-dim active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
              Add Server
            </button>
          </div>
        )}

        {/* Server grid */}
        {endpoints.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {endpoints.map((ep) => (
              <div
                key={ep.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-card)] text-sm border ${
                  ep.enabled
                    ? "bg-surface-container border-outline-variant/30"
                    : "bg-surface-container/30 border-outline-variant/15 opacity-60"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ep.enabled ? "bg-success" : "bg-on-surface-variant/40"}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-on-surface truncate">{ep.name}</div>
                  <div className="text-on-surface-variant/60 text-xs truncate font-mono">{ep.apiUrl.replace(/^https?:\/\//, "")}</div>
                </div>
                <button
                  onClick={() => startEdit(ep)}
                  className="text-on-surface-variant hover:text-primary transition-colors shrink-0 p-2 min-h-11 min-w-11"
                  title="Edit"
                  aria-label={`Edit ${ep.name}`}
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-on-surface-variant">No Proxmox servers configured yet.</p>
            <button
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-primary text-on-primary hover:bg-primary-dim active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
              Add Server
            </button>
          </div>
        )}

        {/* Edit / Create Form */}
        {(editing || creating) && (
          <div className="border-t border-outline-variant/30 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-on-surface mb-4" id="endpoint-form-title">
              {editing ? `Edit: ${editing.name}` : "Add Proxmox Server"}
            </h3>
            <div className="space-y-3" role="form" aria-labelledby="endpoint-form-title">
              <div>
                <label htmlFor="pve-endpoint-name" className="block text-xs text-on-surface-variant mb-1">Name</label>
                <input
                  id="pve-endpoint-name"
                  className="w-full px-3 py-2 bg-bg border border-outline-variant/40 rounded-[var(--radius-button)] text-sm text-on-surface outline-none focus:border-primary transition-colors"
                  placeholder="e.g. Main Cluster"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="pve-endpoint-url" className="block text-xs text-on-surface-variant mb-1">API URL</label>
                <input
                  id="pve-endpoint-url"
                  className="w-full px-3 py-2 bg-bg border border-outline-variant/40 rounded-[var(--radius-button)] text-sm text-on-surface outline-none focus:border-primary transition-colors font-mono"
                  placeholder="https://192.168.1.10:8006"
                  value={form.apiUrl}
                  onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="pve-endpoint-token" className="block text-xs text-on-surface-variant mb-1">
                  API Token {editing && <span className="text-on-surface-variant">(leave blank to keep current)</span>}
                </label>
                <textarea
                  id="pve-endpoint-token"
                  className="w-full px-3 py-2 bg-bg border border-outline-variant/40 rounded-[var(--radius-button)] text-sm text-on-surface outline-none focus:border-primary transition-colors font-mono resize-y"
                  placeholder={editing ? "••••••••" : "root@pam!monitor=xxx"}
                  rows={2}
                  value={form.apiToken}
                  onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="pve-ssh-target-map" className="block text-xs text-on-surface-variant mb-1">Per-node SSH targets <span className="text-on-surface-variant">(optional)</span></label>
                <textarea
                  id="pve-ssh-target-map"
                  className="w-full px-3 py-2 bg-bg border border-outline-variant/40 rounded-[var(--radius-button)] text-sm text-on-surface outline-none focus:border-primary transition-colors font-mono resize-y"
                  placeholder={"pve-master = root@192.168.1.10"}
                  rows={3}
                  value={form.sshTargetMap}
                  onChange={(e) => setForm({ ...form, sshTargetMap: e.target.value })}
                />
                <p className="mt-1 text-xs text-on-surface-variant">One mapping per line: <code>node = user@hostname-or-IPv4</code>. Required only to restart guests; monitoring works without it.</p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
                  <input
                    type="checkbox"
                    className="rounded bg-surface-container-high border-outline-variant text-primary focus:ring-primary"
                    checked={form.verifyTls}
                    onChange={(e) => setForm({ ...form, verifyTls: e.target.checked })}
                  />
                  Verify TLS
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
                  <input
                    type="checkbox"
                    className="rounded bg-surface-container-high border-outline-variant text-primary focus:ring-primary"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6">
              {editing && (
                <button
                  onClick={() => handleDelete(editing.id)}
                  className="px-3 py-2 text-sm text-error hover:text-error/80 transition-colors"
                >
                  Delete
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => { resetForm(); }}
                  className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors rounded-[var(--radius-button)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.apiUrl || (!editing && !form.apiToken)}
                  className="px-4 py-2 bg-primary text-on-primary hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium rounded-[var(--radius-button)] transition-all duration-200 active:scale-[0.98]"
                >
                  {saving ? "Saving…" : editing ? "Save Changes" : "Add Server"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
