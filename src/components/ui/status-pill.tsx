type StatusVariant = "success" | "failed" | "running";

const statusStyles: Record<StatusVariant, string> = {
  success:
    "bg-success/10 text-success border-success/30",
  failed:
    "bg-error/10 text-error border-error/30",
  running:
    "bg-info/10 text-info border-info/30",
};

export function StatusPill({ status, label }: { status: StatusVariant; label?: string }) {
  return (
    <span
      className={`status-badge ${statusStyles[status]}`}
    >
      {label ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function statusVariantFromString(s: string): StatusVariant {
  if (s === "success") return "success";
  if (s === "failed") return "failed";
  return "running";
}
