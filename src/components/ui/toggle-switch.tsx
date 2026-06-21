"use client";

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: () => void;
  label?: string;
}

export function ToggleSwitch({ enabled, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onChange}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-primary
        focus-visible:ring-offset-2 focus-visible:ring-offset-surface-low
      `}
      style={{ backgroundColor: enabled ? "#00FF9C" : "#4B5563" }}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg
          ring-0 transition duration-200 ease-in-out
        `}
        style={{ transform: `translateX(${enabled ? "16px" : "0px"})` }}
      />
    </button>
  );
}
