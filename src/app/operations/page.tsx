import { AppShell } from "@/components/layout/app-shell";
import { OperationsPage } from "@/components/operations/operations-page";

export default function Page() {
  return (
    <AppShell noScroll>
      <OperationsPage />
    </AppShell>
  );
}
