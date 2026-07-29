import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const TextInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-semibold text-on-surface">{label}</label>
        )}
        <input
          ref={ref}
          className={`w-full bg-surface-container-high border border-outline-variant/50 px-3 py-2.5 text-sm text-on-surface font-mono transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none rounded-[var(--radius-button)] ${className}`}
          {...props}
        />
        {hint && <p className="text-[11px] text-on-surface-variant">{hint}</p>}
      </div>
    );
  }
);
TextInput.displayName = "TextInput";

interface SelectProps extends Omit<InputHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  children: React.ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className = "", children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-semibold text-on-surface">{label}</label>
        )}
        <select
          ref={ref}
          className={`w-full bg-surface-container-high border border-outline-variant/50 px-3 py-2.5 text-sm text-on-surface transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none rounded-[var(--radius-button)] ${className}`}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  }
);
Select.displayName = "Select";
