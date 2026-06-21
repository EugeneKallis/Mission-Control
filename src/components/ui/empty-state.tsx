export function EmptyState({ icon, message }: { icon?: string; message?: string }) {
  return (
    <div className="text-center py-10 text-sm italic text-on-surface-variant">
      {icon && (
        <div className="mb-2">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant">
            {icon}
          </span>
        </div>
      )}
      {message ?? "No data found."}
    </div>
  );
}
