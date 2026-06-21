type StatusVariant = "success" | "failed" | "running";

const statusStyles: Record<StatusVariant, string> = {
  success:
    "bg-primary/10 text-primary border-primary/30",
  failed:
    "bg-error/10 text-error border-error/30",
  running:
    "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
};

export function StatusPill({ status, label }: { status: StatusVariant; label?: string }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-0.5 text-[11px] font-bold rounded-none border ${statusStyles[status]}`}
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
