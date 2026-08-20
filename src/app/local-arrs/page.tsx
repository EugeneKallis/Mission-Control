import { AppShell } from "@/components/layout/app-shell";
import { LocalArrsPage } from "@/components/local-arrs/local-arrs-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell noScroll>
      <LocalArrsPage />
    </AppShell>
  );
}
