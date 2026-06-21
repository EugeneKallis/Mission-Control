"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Modal({ open, onClose, title, icon, children, actions }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        className="max-w-lg w-full flex flex-col glass-modal"
      >
        {/* Header */}
        <div className="p-6 flex justify-between items-center border-b border-outline-variant/30">
          <h2 className="text-xl font-bold flex items-center gap-2 font-display text-on-surface">
            {icon && <span className="material-symbols-outlined text-primary">{icon}</span>}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>

        {/* Actions */}
        {actions && (
          <div className="p-6 flex justify-end gap-3 border-t border-outline-variant/30 bg-surface">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
