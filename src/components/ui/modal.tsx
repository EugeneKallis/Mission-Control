"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Accessible modal dialog.
 *
 * - role="dialog" + aria-modal="true" + aria-labelledby pointing to the title
 * - Escape closes, backdrop click closes
 * - Focus trap: Tab cycles through focusable elements inside the dialog
 * - Focus restored to previous element on close
 */
export function Modal({ open, onClose, title, icon, children, actions, className = "", contentClassName = "" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap: Tab cycles through focusable elements inside the dialog
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  // Save focus, move it into the dialog, and restore it on close/unmount.
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const first = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(16px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={`max-w-lg w-full flex flex-col glass-modal ${className}`}
      >
        {/* Header */}
        <div className="p-6 flex justify-between items-center border-b border-outline-variant/30">
          <h2 id={titleId} className="text-xl font-bold flex items-center gap-2 font-display text-on-surface">
            {icon && <span className="material-symbols-outlined text-primary" aria-hidden="true">{icon}</span>}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors rounded-[var(--radius-button)] hover:bg-surface-container"
            aria-label="Close dialog"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Content */}
        <div className={`p-6 overflow-y-auto flex-1 max-h-[60vh] ${contentClassName}`}>{children}</div>

        {/* Actions */}
        {actions && (
          <div className="p-6 flex justify-end gap-3 border-t border-outline-variant/30 bg-surface rounded-b-[var(--radius-modal)]">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
