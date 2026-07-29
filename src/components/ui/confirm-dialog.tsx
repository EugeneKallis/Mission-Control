"use client";

import type { ReactNode } from "react";
import { Modal } from "./modal";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  icon?: string;
  children: ReactNode;
  confirmLabel?: string;
  variant?: "danger" | "primary";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  icon,
  children,
  confirmLabel = "Confirm",
  variant = "danger",
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={icon ?? (variant === "danger" ? "warning" : "check_circle")}
      actions={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors rounded-[var(--radius-button)] hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 active:scale-[0.98] ${
              variant === "danger"
                ? "bg-error text-on-error hover:bg-red-500"
                : "bg-primary text-on-primary hover:bg-primary-dim"
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
