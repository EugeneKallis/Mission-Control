"use client";

import { useCallback, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { DozzleEndpointConfig } from "./docker-logs-types";

interface EndpointSettingsProps {
  endpoints: DozzleEndpointConfig[];
  onClose: () => void;
  onSaved: () => void;
}

interface EndpointForm {
  name: string;
  apiUrl: string;
  enabled: boolean;
}

const EMPTY_FORM: EndpointForm = {
  name: "",
  apiUrl: "",
  enabled: true,
};

export function EndpointSettings({ endpoints, onClose, onSaved }: EndpointSettingsProps) {
  const [editing, setEditing] = useState<DozzleEndpointConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EndpointForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
    setError(null);
  }, []);

  const startCreate = useCallback(() => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
    setError(null);
  }, []);

  const startEdit = useCallback((endpoint: DozzleEndpointConfig) => {
    setEditing(endpoint);
    setCreating(false);
    setForm({ name: endpoint.name, apiUrl: endpoint.apiUrl, enabled: endpoint.enabled });
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const url = editing
        ? `/api/docker-logs/endpoints/${editing.id}`
        : "/api/docker-logs/endpoints";
      const response = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          apiUrl: form.apiUrl,
          enabled: form.enabled,
          ...(editing ? {} : { order: endpoints.length }),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      reset();
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [editing, endpoints.length, form, onSaved, reset]);

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm("Delete this Docker Logs instance?")) return;
    setError(null);
    try {
      const response = await fetch(`/api/docker-logs/endpoints/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      reset();
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [onSaved, reset]);

  const formOpen = editing !== null || creating;

  return (
    <Modal open onClose={onClose} title="Docker Logs Instances" icon="dns">
      <div className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-[var(--radius-button)] text-sm text-error bg-error/10 border border-error/30">
            {error}
          </div>
        )}

        {endpoints.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant">
              {endpoints.length} instance{endpoints.length === 1 ? "" : "s"} configured
            </span>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] bg-primary text-on-primary hover:bg-primary-dim transition-colors"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
              Add Instance
            </button>
          </div>
        )}

        {endpoints.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {endpoints.map((endpoint) => (
              <div
                key={endpoint.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-card)] text-sm border ${
                  endpoint.enabled
                    ? "bg-surface-container border-outline-variant/30"
                    : "bg-surface-container/30 border-outline-variant/15 opacity-60"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${endpoint.enabled ? "bg-success" : "bg-on-surface-variant/40"}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-on-surface truncate">{endpoint.name}</div>
                  <div className="text-on-surface-variant/60 text-xs truncate font-mono">{endpoint.apiUrl.replace(/^https?:\/\//, "")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(endpoint)}
                  className="text-on-surface-variant hover:text-primary transition-colors shrink-0 p-2 min-h-11 min-w-11"
                  title="Edit"
                  aria-label={`Edit ${endpoint.name}`}
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              </div>
            ))}
          </div>
        ) : !formOpen ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-on-surface-variant">No Docker Logs instances configured yet.</p>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] bg-primary text-on-primary hover:bg-primary-dim transition-colors"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
              Add Instance
            </button>
          </div>
        ) : null}

        {formOpen && (
          <div className="border-t border-outline-variant/30 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-on-surface mb-4">
              {editing ? `Edit: ${editing.name}` : "Add Docker Logs Instance"}
            </h3>
            <div className="space-y-3" role="form" aria-label="Docker Logs instance form">
              <div>
                <label htmlFor="docker-logs-name" className="block text-xs text-on-surface-variant mb-1">Name</label>
                <input
                  id="docker-logs-name"
                  className="w-full px-3 py-2 bg-bg border border-outline-variant/40 rounded-[var(--radius-button)] text-sm text-on-surface outline-none focus:border-primary transition-colors"
                  placeholder="e.g. Main Docker"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor="docker-logs-url" className="block text-xs text-on-surface-variant mb-1">Dozzle URL</label>
                <input
                  id="docker-logs-url"
                  className="w-full px-3 py-2 bg-bg border border-outline-variant/40 rounded-[var(--radius-button)] text-sm text-on-surface outline-none focus:border-primary transition-colors font-mono"
                  placeholder="http://192.168.1.111:8080"
                  value={form.apiUrl}
                  onChange={(event) => setForm({ ...form, apiUrl: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
                <input
                  type="checkbox"
                  aria-label="Enabled"
                  className="rounded bg-surface-container-high border-outline-variant text-primary focus:ring-primary"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                Enabled
              </label>
            </div>
            <div className="flex items-center justify-between mt-6">
              {editing ? (
                <button type="button" onClick={() => handleDelete(editing.id)} className="px-3 py-2 text-sm text-error hover:text-error/80 transition-colors">
                  Delete
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button type="button" onClick={reset} className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors rounded-[var(--radius-button)]">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.apiUrl.trim()}
                  className="px-4 py-2 bg-primary text-on-primary hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium rounded-[var(--radius-button)] transition-colors"
                >
                  {saving ? "Saving…" : editing ? "Save Changes" : "Add Instance"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
