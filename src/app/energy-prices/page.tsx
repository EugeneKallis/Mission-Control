import { AppShell } from "@/components/layout/app-shell";
import { EnergyPricesPage } from "@/components/energy-prices/energy-prices-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell noScroll>
      <EnergyPricesPage />
    </AppShell>
  );
}
