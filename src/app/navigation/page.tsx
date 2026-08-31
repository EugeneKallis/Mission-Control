import { AppShell } from "@/components/layout/app-shell";
import { NavigationPage } from "@/components/navigation/navigation-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell noScroll>
      <NavigationPage />
    </AppShell>
  );
}
