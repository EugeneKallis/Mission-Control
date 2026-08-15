import { AppShell } from "@/components/layout/app-shell";
import { PulsePage } from "@/components/pulse/pulse-page";

export default function Page() {
  return (
    <AppShell noScroll>
      <PulsePage />
    </AppShell>
  );
}
