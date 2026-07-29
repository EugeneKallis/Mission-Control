export function EmptyState({ icon, message }: { icon?: string; message?: string }) {
  return (
    <div className="text-center py-12 text-sm text-on-surface-variant/70">
      {icon && (
        <div className="mb-3">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
            {icon}
          </span>
        </div>
      )}
      <p>{message ?? "No data found."}</p>
    </div>
  );
}
