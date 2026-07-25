import { AppShell } from "@/components/layout/app-shell";
import { ProxmoxPage } from "@/components/proxmox/proxmox-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell noScroll>
      <ProxmoxPage />
    </AppShell>
  );
}
