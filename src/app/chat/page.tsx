"use client";

import { AppShell } from "@/components/layout/app-shell";
import { ChatPage } from "@/components/chat/chat-page";

export default function ChatRoutePage() {
  return (
    <AppShell>
      <ChatPage />
    </AppShell>
  );
}
