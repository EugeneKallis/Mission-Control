import { AppShell } from "@/components/layout/app-shell";
import { IntegrationHealthPage } from "@/components/integrations/integration-health-page";

export default function Page() {
  return (
    <AppShell noScroll>
      <IntegrationHealthPage />
    </AppShell>
  );
}
