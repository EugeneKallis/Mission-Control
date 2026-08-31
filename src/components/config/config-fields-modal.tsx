"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast-provider";
import type { ConfigFieldDefinition } from "@/lib/config-fields";
import { ConfigFieldInput } from "./config-field-input";

interface ConfigFieldsModalProps {
  fields: readonly ConfigFieldDefinition[];
  title: string;
  icon: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function ConfigFieldsModal({ fields, title, icon, onClose, onSaved }: ConfigFieldsModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // Capture keys once so a new `fields` array identity (parent re-render) can't
  // re-run the load and clobber unsaved edits.
  const [fieldKeys] = useState(() => fields.map((field) => field.key));
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/config")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load config");
        return response.json() as Promise<Record<string, string>>;
      })
      .then((data) => {
        const seeded: Record<string, string> = {};
        for (const key of fieldKeys) seeded[key] = data[key] ?? "";
        setValues(seeded);
      })
      .catch(() => {
        setLoadFailed(true);
        showToast("Failed to load config", "error");
      })
      .finally(() => setLoading(false));
  }, [fieldKeys, showToast]);

  const setField = useCallback((key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (loadFailed) return; // never persist an empty/blanked form from a failed load
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const key of fieldKeys) payload[key] = values[key] ?? "";
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Save failed");
      showToast("Settings saved", "success");
      onSaved?.();
      onClose();
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }, [fieldKeys, loadFailed, onClose, onSaved, showToast, values]);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      icon={icon}
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
        <div className="space-y-5">
          {fields.map((field) => (
            <ConfigFieldInput key={field.key} field={field} value={values[field.key] ?? ""} onChange={(value) => setField(field.key, value)} />
          ))}
        </div>
      )}
    </Modal>
  );
}
