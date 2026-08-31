"use client";

import type { ConfigFieldDefinition } from "@/lib/config-fields";

const inputClass =
  "w-full bg-surface border border-outline-variant/40 rounded-[var(--radius-button)] px-3 py-2 text-sm font-mono text-on-surface outline-none focus:border-primary transition-colors";
const labelClass = "block text-sm font-medium text-on-surface mb-2";

export function ConfigFieldInput({ field, value, onChange }: { field: ConfigFieldDefinition; value: string; onChange: (value: string) => void }) {
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
