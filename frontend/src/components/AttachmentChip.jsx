import React from "react";

const FILE_ICONS = {
  "image/": "🖼",
  "application/pdf": "📄",
  "text/": "📝",
  "application/": "📎",
};

function getIcon(mimeType) {
  if (!mimeType) return "📎";
  for (const [prefix, icon] of Object.entries(FILE_ICONS)) {
    if (mimeType.startsWith(prefix)) return icon;
  }
  return "📎";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function AttachmentChip({ attachment, onRemove }) {
  const icon = getIcon(attachment.type);
  const sizeLabel = attachment.size ? formatSize(attachment.size) : "";

  return (
    <div className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-xs text-slate-300 max-w-[200px]">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{attachment.name || "file"}</span>
      {sizeLabel && <span className="text-slate-500 shrink-0">({sizeLabel})</span>}
      {onRemove && (
        <button
          onClick={() => onRemove(attachment)}
          className="shrink-0 ml-0.5 text-slate-500 hover:text-red-400 transition-colors"
          title="Remove attachment"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default AttachmentChip;
