import { AppShell } from "@/components/layout/app-shell";
import { DockerLogsPage } from "@/components/docker-logs/docker-logs-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell noScroll>
      <DockerLogsPage />
    </AppShell>
  );
}
