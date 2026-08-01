-- Per-node SSH targets are intentionally separate from the Proxmox API URL.
ALTER TABLE "proxmox_endpoints" ADD COLUMN "ssh_target_map" TEXT NOT NULL DEFAULT '';
