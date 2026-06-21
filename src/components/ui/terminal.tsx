import { type ReactNode } from "react";

interface TerminalProps {
  children?: ReactNode;
  html?: string;
  className?: string;
}

export function Terminal({ children, html, className = "" }: TerminalProps) {
  return (
    <div
      className={`flex-1 p-5 font-mono text-sm leading-relaxed overflow-y-auto whitespace-pre-wrap break-all terminal-scanline terminal-glow rounded-none ${className}`}
      style={{ background: "#0E0E0E", color: "#E5E2E1" }}
    >
      {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : children}
    </div>
  );
}
