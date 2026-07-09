import React from "react";
import ReactMarkdown from "react-markdown";

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
        {/* Render content with react-markdown (handles code blocks, links, etc. natively) */}
        <div className="text-sm leading-relaxed break-words">
          <ReactMarkdown>{content}</ReactMarkdown>
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