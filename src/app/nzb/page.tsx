"use client";

import { AppShell } from "@/components/layout/app-shell";
import { FileTreeViewer } from "@/components/file-tree-viewer";

export default function NZBPage() {
  return (
    <AppShell noScroll>
      <FileTreeViewer source="nzb" />
    </AppShell>
  );
}
