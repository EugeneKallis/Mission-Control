import { describe, expect, test } from "bun:test";
import { buildGuestRestartCommand, isValidSshHostname, isValidSshTarget, normalizeSshTargetMap, resolveSshTarget } from "./pve-restart";

describe("Proxmox restart command boundary", () => {
  test("accepts only a safe verified node hostname", () => {
    expect(isValidSshHostname("pve-node.example")).toBe(true);
    expect(isValidSshHostname("pve-node;rm -rf /")).toBe(false);
    expect(isValidSshHostname("root@pve-node")).toBe(false);
  });

  test("validates, normalizes, and resolves safe per-node SSH mappings", () => {
    expect(isValidSshTarget("root@192.168.1.10")).toBe(true);
    expect(isValidSshTarget("root@pve-node")).toBe(true);
    expect(isValidSshTarget("root@pve;evil")).toBe(false);
    expect(normalizeSshTargetMap(" pve-master = root@192.168.1.10 \n\npve-worker = admin@pve-2 "))
      .toBe("pve-master = root@192.168.1.10\npve-worker = admin@pve-2");
    expect(resolveSshTarget("pve-master = root@192.168.1.10", "pve-master")).toBe("root@192.168.1.10");
    expect(resolveSshTarget("pve-master = root@192.168.1.10", "pve-worker")).toBeNull();
    expect(() => normalizeSshTargetMap("pve-master = root@host;id")).toThrow();
    expect(() => normalizeSshTargetMap("pve-master = root@one\npve-master = root@two")).toThrow();
  });

  test("builds only canonical VM and LXC restart commands for a verified target", () => {
    expect(buildGuestRestartCommand("root@192.168.1.10", 100, "vm"))
      .toBe("bun run scripts/util/command-runner.ts --host root@192.168.1.10 -- qm reboot 100");
    expect(buildGuestRestartCommand("root@pve-node", 200, "lxc"))
      .toBe("bun run scripts/util/command-runner.ts --host root@pve-node -- pct reboot 200");
  });
});
