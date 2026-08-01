import { describe, expect, test } from "bun:test";
import { buildGuestRestartCommand, isValidSshHostname } from "./pve-restart";

describe("Proxmox restart command boundary", () => {
  test("accepts only a safe verified node hostname", () => {
    expect(isValidSshHostname("pve-node.example")).toBe(true);
    expect(isValidSshHostname("pve-node;rm -rf /")).toBe(false);
    expect(isValidSshHostname("root@pve-node")).toBe(false);
  });

  test("builds only canonical VM and LXC restart commands", () => {
    expect(buildGuestRestartCommand("pve-node", 100, "vm"))
      .toBe("bun run scripts/util/command-runner.ts --host root@pve-node -- qm reboot 100");
    expect(buildGuestRestartCommand("pve-node", 200, "lxc"))
      .toBe("bun run scripts/util/command-runner.ts --host root@pve-node -- pct reboot 200");
  });
});
