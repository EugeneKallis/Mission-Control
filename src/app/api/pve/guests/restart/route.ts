/**
 * POST /api/pve/guests/restart
 *
 * Verifies a fresh guest snapshot, then prepares (but does not run) a hidden
 * macro. The browser navigates to the home macro deep-link so its EventSource
 * terminal is connected before /api/run starts the command.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createMacro, getProxmoxEndpoint } from "@/lib/db/queries";
import { ProxmoxClient } from "@/lib/clients/proxmox";
import { buildGuestRestartCommand, isValidSshHostname, resolveSshTarget } from "@/lib/pve-restart";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  endpointId: z.number().int().positive(),
  node: z.string().min(1).max(63),
  vmid: z.number().int().positive(),
  type: z.enum(["vm", "lxc"]),
}).strict();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid restart request" }, { status: 400 });
  }

  const { endpointId, node, vmid, type } = parsed.data;
  try {
    const endpoint = await getProxmoxEndpoint(endpointId);
    if (!endpoint) {
      return NextResponse.json({ error: "Proxmox endpoint not found" }, { status: 404 });
    }
    if (!endpoint.enabled) {
      return NextResponse.json({ error: "Proxmox endpoint is disabled" }, { status: 409 });
    }
    // Deliberately bypass the status cache: guest state must be current when
    // a destructive action is prepared.
    let snapshot;
    try {
      snapshot = await new ProxmoxClient(endpoint.apiUrl, endpoint.apiToken, endpoint.verifyTls).getSnapshot();
    } catch (error) {
      console.error(`[pve] Failed to refresh endpoint ${endpoint.id} before restart:`, error);
      return NextResponse.json({ error: "Unable to refresh Proxmox guest status" }, { status: 502 });
    }

    const freshNode = snapshot.nodes.find((candidate) => candidate.node === node);
    // `node` is only a lookup key. The command target is the matching node
    // name returned by this authenticated, uncached snapshot.
    if (!freshNode || !isValidSshHostname(freshNode.node)) {
      return NextResponse.json({ error: "Requested Proxmox node is not a safe SSH hostname" }, { status: 409 });
    }
    // The actual SSH destination is endpoint configuration keyed by the
    // authenticated snapshot node, never the browser request or API URL.
    const sshTarget = resolveSshTarget(endpoint.sshTargetMap, freshNode.node);
    if (!sshTarget) {
      return NextResponse.json({ error: `No SSH target is configured for Proxmox node ${freshNode.node}` }, { status: 409 });
    }
    const guests = type === "vm" ? freshNode.vms : freshNode.containers;
    const guest = guests.find((candidate) => candidate.vmid === vmid);
    if (!guest || guest.status !== "running") {
      return NextResponse.json({ error: "Guest is not currently running on the requested node" }, { status: 409 });
    }

    const macro = await createMacro({
      name: `Restart ${type === "vm" ? "VM" : "LXC"} ${vmid}`,
      description: `Prepared Proxmox ${type === "vm" ? "VM" : "LXC container"} restart on ${endpoint.name}.`,
      commands: JSON.stringify([{
        ord: 0,
        cmd: buildGuestRestartCommand(sshTarget, vmid, type),
      }]),
      isInternal: true,
    });

    return NextResponse.json({ macroId: macro.id });
  } catch (error) {
    console.error("[pve] Failed to prepare guest restart:", error);
    return NextResponse.json({ error: "Failed to prepare guest restart" }, { status: 500 });
  }
}
