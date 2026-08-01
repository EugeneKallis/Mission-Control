/** Security boundary for prepared Proxmox guest restart macros. */

/** DNS hostname labels only, with no user/port component. */
const SSH_HOSTNAME_RE = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;
const SSH_USER_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidSshHostname(value: unknown): value is string {
  return typeof value === "string" && SSH_HOSTNAME_RE.test(value);
}

/** A target is deliberately limited to user@hostname or user@IPv4 (no ports/options). */
export function isValidSshTarget(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false;
  const user = value.slice(0, separator);
  const host = value.slice(separator + 1);
  return SSH_USER_RE.test(user) && (isValidSshHostname(host) || IPV4_RE.test(host));
}

/**
 * Validates and canonicalizes one `node = user@host` mapping per non-empty
 * line. The stored text is normalized so restart resolution is deterministic.
 */
export function normalizeSshTargetMap(value: string): string {
  const seen = new Set<string>();
  const mappings: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([^=]+?)\s*=\s*(.+)$/.exec(line);
    if (!match) throw new Error("Each SSH target mapping must use node = user@hostname-or-IPv4");
    const node = match[1].trim();
    const target = match[2].trim();
    if (!isValidSshHostname(node) || !isValidSshTarget(target)) {
      throw new Error("SSH target mappings require a safe node name and user@hostname-or-IPv4 target");
    }
    if (seen.has(node)) throw new Error(`Duplicate SSH target mapping for node ${node}`);
    seen.add(node);
    mappings.push(`${node} = ${target}`);
  }
  return mappings.join("\n");
}

export function resolveSshTarget(sshTargetMap: string, verifiedNode: string): string | null {
  if (!isValidSshHostname(verifiedNode)) return null;
  try {
    for (const line of normalizeSshTargetMap(sshTargetMap).split("\n")) {
      if (!line) continue;
      const [node, target] = line.split(" = ");
      if (node === verifiedNode) return target;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildGuestRestartCommand(
  verifiedSshTarget: string,
  vmid: number,
  type: "vm" | "lxc",
): string {
  if (!isValidSshTarget(verifiedSshTarget)) {
    throw new Error("Invalid verified Proxmox SSH target");
  }
  if (!Number.isSafeInteger(vmid) || vmid <= 0) {
    throw new Error("Invalid guest ID");
  }

  const remoteCommand = type === "vm" ? `qm reboot ${vmid}` : `pct reboot ${vmid}`;
  return `bun run scripts/util/command-runner.ts --host ${verifiedSshTarget} -- ${remoteCommand}`;
}
