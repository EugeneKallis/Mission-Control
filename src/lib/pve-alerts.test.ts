import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PVE_THRESHOLDS,
  buildThresholds,
  countPveAlerts,
  guestAlerts,
  storageAlerts,
  thresholdColorFor,
} from "./pve-alerts";

const baseGuest = {
  vmid: 100,
  name: "test",
  cpu: 0.5,
  cpus: 4,
  mem: 4_000_000_000,
  maxmem: 8_000_000_000,
  disk: 20_000_000_000,
  maxdisk: 100_000_000_000,
  status: "running" as const,
  type: "vm" as const,
};

const baseContainer = { ...baseGuest, type: "lxc" as const };

describe("buildThresholds", () => {
  test("returns defaults when no input", () => {
    expect(buildThresholds()).toEqual(DEFAULT_PVE_THRESHOLDS);
  });

  test("clamps values to 0-100 integers", () => {
    expect(buildThresholds({ cpu: -5, memory: 95.7, storage: 150 })).toEqual({
      cpu: 0,
      memory: 96,
      storage: 100,
    });
  });

  test("tolerates malformed undefined fields", () => {
    expect(buildThresholds({ cpu: undefined })).toEqual({
      cpu: 80,
      memory: 80,
      storage: 80,
    });
  });
});

describe("thresholdColorFor", () => {
  test("above threshold is error", () => {
    expect(thresholdColorFor(81, DEFAULT_PVE_THRESHOLDS, "cpu").color).toBe("error");
  });

  test("exactly at threshold is ok", () => {
    expect(thresholdColorFor(80, DEFAULT_PVE_THRESHOLDS, "cpu").color).toBe("ok");
  });

  test("between 75% of threshold and threshold is warning", () => {
    expect(thresholdColorFor(70, DEFAULT_PVE_THRESHOLDS, "cpu").color).toBe("warning");
  });

  test("below warning band is ok", () => {
    expect(thresholdColorFor(50, DEFAULT_PVE_THRESHOLDS, "cpu").color).toBe("ok");
  });

  test("uses a warning band proportional to the configured threshold", () => {
    const thresholds = { cpu: 50, memory: 50, storage: 50 };
    expect(thresholdColorFor(40, thresholds, "cpu").color).toBe("warning");
    expect(thresholdColorFor(30, thresholds, "cpu").color).toBe("ok");
  });
});

describe("guestAlerts", () => {
  test("returns empty when no metric breaches", () => {
    expect(guestAlerts(baseGuest, DEFAULT_PVE_THRESHOLDS)).toEqual([]);
  });

  test("detects CPU breach", () => {
    const guest = { ...baseGuest, cpu: 0.85 };
    const alerts = guestAlerts(guest, DEFAULT_PVE_THRESHOLDS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].metric).toBe("cpu");
    expect(alerts[0].pct).toBe(85);
  });

  test("detects memory breach", () => {
    const guest = { ...baseGuest, mem: 7_000_000_000 };
    const alerts = guestAlerts(guest, DEFAULT_PVE_THRESHOLDS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].metric).toBe("memory");
    expect(alerts[0].pct).toBe(87.5);
  });

  test("detects storage breach", () => {
    const guest = { ...baseGuest, disk: 90_000_000_000 };
    const alerts = guestAlerts(guest, DEFAULT_PVE_THRESHOLDS);
    expect(alerts[0].metric).toBe("storage");
  });

  test("detects multiple simultaneous breaches", () => {
    const guest = { ...baseGuest, cpu: 0.85, mem: 7_000_000_000 };
    const alerts = guestAlerts(guest, DEFAULT_PVE_THRESHOLDS);
    expect(alerts).toHaveLength(2);
  });

  test("strictly greater than threshold only", () => {
    const guest = {
      ...baseGuest,
      cpu: 0.8,
      mem: 6_400_000_000,
      maxmem: 8_000_000_000,
      disk: 80_000_000_000,
    };
    expect(guestAlerts(guest, DEFAULT_PVE_THRESHOLDS)).toEqual([]);
  });
});

describe("storageAlerts", () => {
  test("returns empty when usage is within threshold", () => {
    expect(storageAlerts({ storage: "local", used: 70, total: 100 }, DEFAULT_PVE_THRESHOLDS)).toEqual([]);
  });

  test("detects storage breach", () => {
    const alerts = storageAlerts({ storage: "local", used: 81, total: 100 }, DEFAULT_PVE_THRESHOLDS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].metric).toBe("storage");
    expect(alerts[0].pct).toBe(81);
  });
});

describe("countPveAlerts", () => {
  function mkEndpoint(name: string, nodeName: string) {
    return {
      name,
      nodes: [
        {
          node: nodeName,
          vms: [] as (Omit<typeof baseGuest, "status" | "type"> & { status: "running" | "stopped"; type: "vm" })[],
          containers: [] as (Omit<typeof baseContainer, "type"> & { type: "lxc" })[],
          storage: [] as { storage: string; used: number; total: number; avail: number }[],
        },
      ],
    };
  }

  test("counts zero when nothing breaches", () => {
    const ep = mkEndpoint("Main", "pve-1");
    ep.nodes[0].vms.push(baseGuest);
    expect(countPveAlerts([ep], DEFAULT_PVE_THRESHOLDS).count).toBe(0);
  });

  test("counts a VM, LXC, and storage pool each once", () => {
    const ep = mkEndpoint("Main", "pve-1");
    ep.nodes[0].vms.push({ ...baseGuest, cpu: 0.85 });
    ep.nodes[0].containers.push({ ...baseContainer, vmid: 200, mem: 7_000_000_000 });
    ep.nodes[0].storage.push({ storage: "local", used: 81, total: 100, avail: 19 });

    const summary = countPveAlerts([ep], DEFAULT_PVE_THRESHOLDS);
    expect(summary.count).toBe(3);
    expect(Object.values(summary.resources).map((r) => r.type).sort()).toEqual(["lxc", "storage", "vm"]);
  });

  test("does not count stopped guests", () => {
    const ep = mkEndpoint("Main", "pve-1");
    ep.nodes[0].vms.push({ ...baseGuest, status: "stopped" as const, cpu: 0.95 });
    expect(countPveAlerts([ep], DEFAULT_PVE_THRESHOLDS).count).toBe(0);
  });

  test("does not double-count a resource with multiple breaches", () => {
    const ep = mkEndpoint("Main", "pve-1");
    ep.nodes[0].vms.push({ ...baseGuest, cpu: 0.85, mem: 7_500_000_000 });
    const summary = countPveAlerts([ep], DEFAULT_PVE_THRESHOLDS);
    expect(summary.count).toBe(1);
    const resource = Object.values(summary.resources)[0];
    expect(resource.metric).toBe("cpu");
  });
});
