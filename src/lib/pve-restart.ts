/** Security boundary for prepared Proxmox guest restart macros. */

/**
 * Proxmox node names are used as SSH hostnames only after the authenticated
 * fresh snapshot has matched the client-supplied lookup key. Keep this stricter
 * than a shell word: DNS hostname labels only, with no user/port component.
 */
const SSH_HOSTNAME_RE = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;

export function isValidSshHostname(value: unknown): value is string {
  return typeof value === "string" && SSH_HOSTNAME_RE.test(value);
}

export function buildGuestRestartCommand(
  verifiedNode: string,
  vmid: number,
  type: "vm" | "lxc",
): string {
  if (!isValidSshHostname(verifiedNode)) {
    throw new Error("Invalid verified Proxmox node hostname");
  }
  if (!Number.isSafeInteger(vmid) || vmid <= 0) {
    throw new Error("Invalid guest ID");
  }

  const remoteCommand = type === "vm" ? `qm reboot ${vmid}` : `pct reboot ${vmid}`;
  return `bun run scripts/util/command-runner.ts --host root@${verifiedNode} -- ${remoteCommand}`;
}
