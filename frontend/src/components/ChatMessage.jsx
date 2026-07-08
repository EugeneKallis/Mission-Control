import React from "react";

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const content = message.content || "";
  const modelName = message.model || "";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-slate-800 text-slate-100 rounded-bl-sm"
        }`}
      >
        {/* Render content - simple markdown-like formatting */}
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {content.split(/(```[\s\S]*?```)/g).map((segment, i) => {
            if (segment.startsWith("```") && segment.endsWith("```")) {
              const codeContent = segment.slice(3, -3);
              const firstNewline = codeContent.indexOf("\n");
              const lang =
                firstNewline > 0 ? codeContent.slice(0, firstNewline).trim() : "";
              const code =
                firstNewline > 0
                  ? codeContent.slice(firstNewline + 1)
                  : codeContent;
              return (
                <pre
                  key={i}
                  className="bg-slate-950/80 rounded p-3 my-2 overflow-x-auto text-xs font-mono"
                >
                  {lang && (
                    <div className="text-slate-500 text-[10px] uppercase mb-1">
                      {lang}
                    </div>
                  )}
                  <code>{code}</code>
                </pre>
              );
            }
            // Inline code and bold/italic - simple regex replacements
            const formatted = segment
              .split(/(`[^`]+`)/g)
              .map((part, j) => {
                if (part.startsWith("`") && part.endsWith("`")) {
                  return (
                    <code
                      key={j}
                      className="bg-slate-700/60 rounded px-1 py-0.5 text-xs font-mono"
                    >
                      {part.slice(1, -1)}
                    </code>
                  );
                }
                // Bold
                const withBold = part.split(/(\*\*[^*]+\*\*)/g).map((p, k) => {
                  if (p.startsWith("**") && p.endsWith("**")) {
                    return (
                      <strong key={k} className="font-semibold">
                        {p.slice(2, -2)}
                      </strong>
                    );
                  }
                  // Links
                  const withLinks = p.split(
                    /(\[([^\]]+)\]\(([^)]+)\))/g,
                  );
                  if (withLinks.length > 1) {
                    const parts = [];
                    for (let li = 0; li < withLinks.length; li++) {
                      if (li % 4 === 0) {
                        parts.push(withLinks[li]);
                      }
                    }
                    return parts.join("");
                  }
                  return p;
                });
                return withBold;
              });
            return <React.Fragment key={i}>{formatted}</React.Fragment>;
          })}
        </div>

        {/* Model name for assistant responses */}
        {!isUser && modelName && (
          <div className="mt-2 text-[10px] text-slate-500 font-mono">
            {modelName.split("/").pop()}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatMessage;
