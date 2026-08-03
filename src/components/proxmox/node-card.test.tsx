import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, userEvent, within } from "@/test-utils/render";

// Bun's test runner does not trigger React Testing Library's auto-cleanup
// between these stateful card tests, so unmount explicitly.
afterEach(cleanup);
import { NodeCard, matchNodeQuery, sortGuests, sortStorage, filterGuests, filterStorage } from "./node-card";
import type { PveGuest, PveNodeDetail, PveStoragePool } from "./proxmox-types";
import { DEFAULT_PVE_THRESHOLDS } from "@/lib/pve-alerts";

const guests: PveGuest[] = [
  {
    vmid: 202,
    name: "Zulu",
    status: "stopped",
    cpu: 0.1,
    cpus: 2,
    mem: 8,
    maxmem: 10,
    disk: 10,
    maxdisk: 100,
    uptime: 0,
    type: "lxc",
  },
  {
    vmid: 101,
    name: "alpha",
    status: "running",
    cpu: 0.8,
    cpus: 4,
    mem: 2,
    maxmem: 10,
    disk: 80,
    maxdisk: 100,
    uptime: 3_600,
    type: "lxc",
  },
];

const storage: PveStoragePool[] = [
  { storage: "zfs-data", type: "zfspool", total: 100, used: 20, avail: 80 },
  { storage: "local", type: "dir", total: 10, used: 8, avail: 2 },
];

const node: PveNodeDetail = {
  node: {
    node: "pve-1",
    status: "online",
    cpu: 0.25,
    maxcpu: 8,
    mem: 8,
    maxmem: 32,
    disk: 20,
    maxdisk: 100,
    uptime: 86_400,
  },
  containers: guests,
  vms: guests.map((guest) => ({ ...guest, type: "vm" as const })),
  storage,
};

function expectTextOrder(container: HTMLElement, first: string, second: string) {
  const text = container.textContent ?? "";
  expect(text.indexOf(first)).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(second)).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
}

describe("matchNodeQuery", () => {
  test("matches node name and status", () => {
    expect(matchNodeQuery("pve-1", node)).toEqual({
      node: true, vms: false, containers: false, storage: false,
    });
    expect(matchNodeQuery("online", node).node).toBe(true);
  });

  test("matches guest name, vmid, and status case-insensitively", () => {
    const m = matchNodeQuery("ZULU", node);
    expect(m.vms).toBe(true);
    expect(m.containers).toBe(true);
    const byVmid = matchNodeQuery("202", node);
    expect(byVmid.vms).toBe(true);
    expect(byVmid.containers).toBe(true);
    expect(matchNodeQuery("stopped", node).containers).toBe(true);
  });

  test("matches storage name and type", () => {
    const byName = matchNodeQuery("zfs-data", node);
    expect(byName.storage).toBe(true);
    expect(byName.node).toBe(false);
    expect(matchNodeQuery("zfspool", node).storage).toBe(true);
  });

  test("empty query matches everything, unmatched query matches nothing", () => {
    expect(matchNodeQuery("", node)).toEqual({ node: true, vms: true, containers: true, storage: true });
    expect(matchNodeQuery("zzz-no-match", node)).toEqual({ node: false, vms: false, containers: false, storage: false });
  });
});

describe("filterGuests / filterStorage", () => {
  test("filterGuests keeps only matching guests and returns all on an empty query", () => {
    expect(filterGuests(guests, "Zulu").map((g) => g.name)).toEqual(["Zulu"]);
    expect(filterGuests(guests, "alpha").map((g) => g.name)).toEqual(["alpha"]);
    expect(filterGuests(guests, "202").map((g) => g.name)).toEqual(["Zulu"]);
    expect(filterGuests(guests, "running").map((g) => g.name)).toEqual(["alpha"]);
    expect(filterGuests(guests, "")).toHaveLength(guests.length);
    expect(filterGuests(guests, "  ")).toHaveLength(guests.length);
    expect(filterGuests(guests, "nope")).toHaveLength(0);
  });

  test("filterStorage keeps only matching pools by name or type", () => {
    expect(filterStorage(storage, "zfs").map((p) => p.storage)).toEqual(["zfs-data"]);
    expect(filterStorage(storage, "dir").map((p) => p.storage)).toEqual(["local"]);
    expect(filterStorage(storage, "")).toHaveLength(storage.length);
    expect(filterStorage(storage, "nope")).toHaveLength(0);
  });
});

describe("NodeCard search behavior", () => {
  test("auto-expands and selects the storage tab when a storage pool matches", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" query="zfs-data" />);
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 storage" })).toBeTruthy();
    expect(screen.getByText("zfs-data")).toBeTruthy();
  });

  test("auto-expands and prefers the VM tab when a guest matches", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" query="Zulu" />);
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 VMs" })).toBeTruthy();
  });

  test("auto-expands for a node-name-only match with no content match", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" query="pve-1" />);
    // Node-name-only matches now auto-expand; the default LXC tab is shown
    // even though no guest row itself matches.
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" })).toBeTruthy();
    expect(screen.getByText("No LXC containers match the search")).toBeTruthy();
  });

  test("lets the user collapse and re-expand a card while a search is active", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" query="Zulu" />);

    const disclosure = screen.getByRole("button", { name: /^pve-1 online/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 VMs" })).toBeTruthy();

    // Manual collapse is respected even though the card content matches.
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).toBeNull();

    // Manual re-expansion works too.
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 VMs" })).toBeTruthy();
  });

  test("empty query keeps the expanded default", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" query="" />);
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" })).toBeTruthy();
  });

  test("clearing search and re-entering the same query resets a collapsed override", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NodeCard node={node} endpointName="Main Cluster" query="" />);

    const disclosure = screen.getByRole("button", { name: /^pve-1 online/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");

    // Enter a search and collapse the card while it is active.
    rerender(<NodeCard node={node} endpointName="Main Cluster" query="Zulu" />);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    // Clear the search — the card should return to the default expanded state.
    rerender(<NodeCard node={node} endpointName="Main Cluster" query="" />);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");

    // Re-enter the same query — the stale override must be gone, so it auto-expands.
    rerender(<NodeCard node={node} endpointName="Main Cluster" query="Zulu" />);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 VMs" })).toBeTruthy();
  });

  test("filters leaf rows: a query matching one guest hides its siblings", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" query="Zulu" />);
    // VMs tab is auto-selected and contains only the matching VM; the sibling
    // is filtered out of every panel.
    const vmTable = screen.getByRole("table", { name: "Main Cluster pve-1 VMs" });
    expect(within(vmTable).getByText("Zulu")).toBeTruthy();
    expect(within(vmTable).queryByText("alpha")).toBeNull();
  });

  test("filters storage rows so only the matching pool is shown", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" query="zfs-data" />);
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 storage" })).toBeTruthy();
    expect(screen.getByText("zfs-data")).toBeTruthy();
    expect(screen.queryByText("local")).toBeNull();
  });

  test("respects a user's tab click during an active query and shows an empty-in-tab state", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" query="Zulu" />);

    // Auto-selected VMs tab shows the matching row.
    const vmTable = screen.getByRole("table", { name: "Main Cluster pve-1 VMs" });
    expect(within(vmTable).getByText("Zulu")).toBeTruthy();

    // A manual click on Storage is respected even though it has no matches.
    await user.click(screen.getByRole("tab", { name: /^Storage/ }));
    const storageTable = screen.getByRole("table", { name: "Main Cluster pve-1 storage" });
    expect(within(storageTable).queryByText("Zulu")).toBeNull();
    expect(screen.getByText("No storage pools match the search")).toBeTruthy();

    // Clicking back to VMs restores the matching row.
    await user.click(screen.getByRole("tab", { name: /^VMs/ }));
    const vmTableAgain = screen.getByRole("table", { name: "Main Cluster pve-1 VMs" });
    expect(within(vmTableAgain).getByText("Zulu")).toBeTruthy();
  });

  test("a query matching multiple categories auto-selects VMs and still filters leaves", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" query="alpha" />);
    // "alpha" matches a VM and a container; VMs wins the auto-select priority.
    const vmTable = screen.getByRole("table", { name: "Main Cluster pve-1 VMs" });
    expect(within(vmTable).getByText("alpha")).toBeTruthy();
    expect(within(vmTable).queryByText("Zulu")).toBeNull();
  });

  test("exposes disclosure and tab semantics for assistive technology", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    const disclosure = screen.getByRole("button", { name: /^pve-1 online/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(disclosure).toHaveAttribute("aria-controls");

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");

    // The expanded content is a labelled region containing a tablist.
    const region = document.getElementById(disclosure.getAttribute("aria-controls")!);
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("role", "region");
    expect(region).toHaveAttribute("aria-labelledby", disclosure.id);

    const lxcTab = screen.getByRole("tab", { name: /^LXC/ });
    const vmsTab = screen.getByRole("tab", { name: /^VMs/ });
    expect(lxcTab).toHaveAttribute("aria-selected", "true");
    expect(vmsTab).toHaveAttribute("aria-selected", "false");
    expect(lxcTab).toHaveAttribute("aria-controls");

    await user.click(vmsTab);
    expect(vmsTab).toHaveAttribute("aria-selected", "true");
    expect(lxcTab).toHaveAttribute("aria-selected", "false");

    const panel = document.getElementById(vmsTab.getAttribute("aria-controls")!);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", vmsTab.id);
  });

  test("mounts every tab panel and hides inactive ones while keeping aria-controls valid", () => {
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    const lxcTab = screen.getByRole("tab", { name: /^LXC/ });
    const vmsTab = screen.getByRole("tab", { name: /^VMs/ });
    const storageTab = screen.getByRole("tab", { name: /^Storage/ });

    // Every tab's aria-controls resolves to a mounted, labelled panel.
    for (const tab of [lxcTab, vmsTab, storageTab]) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute("role", "tabpanel");
      expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    }

    // Only the active panel is visible; inactive panels stay mounted but hidden.
    expect(lxcTab).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById(lxcTab.getAttribute("aria-controls")!)).not.toHaveAttribute("hidden");
    expect(document.getElementById(vmsTab.getAttribute("aria-controls")!)).toHaveAttribute("hidden");
    expect(document.getElementById(storageTab.getAttribute("aria-controls")!)).toHaveAttribute("hidden");
  });

  test("supports roving tabIndex and Arrow/Home/End keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    const lxcTab = screen.getByRole("tab", { name: /^LXC/ });
    const vmsTab = screen.getByRole("tab", { name: /^VMs/ });
    const storageTab = screen.getByRole("tab", { name: /^Storage/ });

    // Roving tabIndex: only the active tab is in the tab order.
    expect(lxcTab).toHaveAttribute("tabindex", "0");
    expect(vmsTab).toHaveAttribute("tabindex", "-1");
    expect(storageTab).toHaveAttribute("tabindex", "-1");

    lxcTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(vmsTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(vmsTab);
    expect(vmsTab).toHaveAttribute("tabindex", "0");
    expect(lxcTab).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowRight}");
    expect(storageTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(storageTab);

    // Wraps around to the first tab.
    await user.keyboard("{ArrowRight}");
    expect(lxcTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(lxcTab);

    await user.keyboard("{ArrowLeft}");
    expect(storageTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(storageTab);

    await user.keyboard("{Home}");
    expect(lxcTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(lxcTab);

    await user.keyboard("{End}");
    expect(storageTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(storageTab);
  });

  test("omits tabs for resource categories the node does not have", () => {
    const storageOnlyNode: PveNodeDetail = { ...node, vms: [], containers: [] };
    render(<NodeCard node={storageOnlyNode} endpointName="Main Cluster" />);

    expect(screen.getByRole("tab", { name: /^Storage/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /^LXC/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /^VMs/ })).toBeNull();
    // The only available tab is selected automatically.
    expect(screen.getByRole("tab", { name: /^Storage/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: "Main Cluster pve-1 storage" })).toBeTruthy();
  });

  test("shows restart only for running guests and passes canonical guest details", async () => {
    const user = userEvent.setup();
    const onRestartGuest = mock();
    render(<NodeCard node={node} endpointName="Main Cluster" onRestartGuest={onRestartGuest} />);

    const runningLxc = screen.getByRole("button", { name: "Restart LXC container alpha (101)" });
    expect(screen.queryByRole("button", { name: "Restart LXC container Zulu (202)" })).toBeNull();
    await user.click(runningLxc);
    expect(onRestartGuest).toHaveBeenCalledWith({ node: "pve-1", vmid: 101, type: "lxc", name: "alpha" });

    await user.click(screen.getByRole("tab", { name: /^VMs/ }));
    expect(screen.getByRole("button", { name: "Restart VM alpha (101)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restart VM Zulu (202)" })).toBeNull();
  });
});

describe("Proxmox sorting helpers", () => {
  test("sorts every guest column in both directions without mutating the API data", () => {
    const cases = [
      ["vmid", "alpha"],
      ["name", "alpha"],
      ["status", "alpha"],
      ["cpu", "Zulu"],
      ["memory", "alpha"],
      ["disk", "Zulu"],
      ["uptime", "Zulu"],
    ] as const;

    for (const [key, firstAscending] of cases) {
      const ascending = sortGuests(guests, { key, direction: "asc" });
      const descending = sortGuests(guests, { key, direction: "desc" });
      expect(ascending[0]?.name).toBe(firstAscending);
      expect(descending[1]?.name).toBe(firstAscending);
    }

    expect(guests.map((guest) => guest.name)).toEqual(["Zulu", "alpha"]);
  });

  test("sorts every storage column in both directions", () => {
    const cases = [
      ["storage", "local"],
      ["type", "local"],
      ["usage", "zfs-data"],
      ["avail", "local"],
    ] as const;

    for (const [key, firstAscending] of cases) {
      const ascending = sortStorage(storage, { key, direction: "asc" });
      const descending = sortStorage(storage, { key, direction: "desc" });
      expect(ascending[0]?.storage).toBe(firstAscending);
      expect(descending[1]?.storage).toBe(firstAscending);
    }
  });
});

describe("NodeCard sortable tables", () => {
  test("sorts LXC rows, reports direction, and supports keyboard activation", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    const table = screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" });

    // Guest tables start in a predictable ID-ascending order.
    expectTextOrder(table, "alpha", "Zulu");

    const nameSort = screen.getByRole("button", { name: /Sort by Name in Main Cluster pve-1 LXC containers/i });
    await user.click(nameSort);
    expectTextOrder(table, "alpha", "Zulu");
    expect(nameSort.parentElement).toHaveAttribute("role", "columnheader");
    expect(nameSort.parentElement).toHaveAttribute("aria-sort", "ascending");

    nameSort.focus();
    await user.keyboard("{Enter}");
    expectTextOrder(table, "Zulu", "alpha");
    expect(nameSort.parentElement).toHaveAttribute("aria-sort", "descending");
  });

  test("wires every guest header to the only active aria-sort state", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    const table = screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" });

    for (const label of ["ID", "Name", "Status", "CPU", "Memory", "Disk", "Uptime"]) {
      const button = screen.getByRole("button", { name: new RegExp(`Sort by ${label} in Main Cluster pve-1 LXC containers`, "i") });
      await user.click(button);
      const expectedDirection = label === "ID" ? "descending" : "ascending";
      expect(button.parentElement).toHaveAttribute("role", "columnheader");
      expect(button.parentElement).toHaveAttribute("aria-sort", expectedDirection);
      expect(table.querySelectorAll('[role="columnheader"][aria-sort]')).toHaveLength(1);
    }
  });

  test("keeps VM and LXC sort choices independent", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    const lxcTable = screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" });
    const nameSort = screen.getByRole("button", { name: /Sort by Name in Main Cluster pve-1 LXC containers/i });
    await user.click(nameSort);
    await user.click(nameSort);
    expectTextOrder(lxcTable, "Zulu", "alpha");

    await user.click(screen.getByRole("tab", { name: /^VMs/ }));
    const vmsTable = screen.getByRole("table", { name: "Main Cluster pve-1 VMs" });
    expectTextOrder(vmsTable, "alpha", "Zulu");
    expect(screen.getByRole("button", { name: /Sort by ID in Main Cluster pve-1 VMs, currently ascending/i })).toBeTruthy();
  });

  test("wires every storage header to the only active aria-sort state", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    await user.click(screen.getByRole("tab", { name: /^Storage/ }));
    const table = screen.getByRole("table", { name: "Main Cluster pve-1 storage" });

    for (const label of ["Name", "Type", "Usage", "Free"]) {
      const button = screen.getByRole("button", { name: new RegExp(`Sort by ${label} in Main Cluster pve-1 storage`, "i") });
      await user.click(button);
      const expectedDirection = label === "Name" ? "descending" : "ascending";
      expect(button.parentElement).toHaveAttribute("role", "columnheader");
      expect(button.parentElement).toHaveAttribute("aria-sort", expectedDirection);
      expect(table.querySelectorAll('[role="columnheader"][aria-sort]')).toHaveLength(1);
    }
  });

  test("sorts storage rows by usage and toggles direction", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={node} endpointName="Main Cluster" />);

    await user.click(screen.getByRole("tab", { name: /^Storage/ }));
    const table = screen.getByRole("table", { name: "Main Cluster pve-1 storage" });

    // Storage starts by name ascending.
    expectTextOrder(table, "local", "zfs-data");

    const usageSort = screen.getByRole("button", { name: /Sort by Usage in Main Cluster pve-1 storage/i });
    await user.click(usageSort);
    expectTextOrder(table, "zfs-data", "local");
    expect(usageSort.parentElement).toHaveAttribute("aria-sort", "ascending");

    await user.click(usageSort);
    expectTextOrder(table, "local", "zfs-data");
    expect(usageSort.parentElement).toHaveAttribute("aria-sort", "descending");
  });
});

describe("NodeCard threshold highlighting", () => {
  test("keeps a node CPU bar at the configured threshold non-alerting", () => {
    const utilizedNode: PveNodeDetail = {
      ...node,
      node: { ...node.node, cpu: 0.8, mem: 16 },
    };

    render(<NodeCard node={utilizedNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} />);

    const cpuBar = screen.getByText("CPU", { selector: "div" }).parentElement?.querySelector<HTMLElement>("div[style]");
    const ramBar = screen.getByText("RAM", { selector: "div" }).parentElement?.querySelector<HTMLElement>("div[style]");
    expect(cpuBar).toHaveClass("bg-primary");
    expect(cpuBar).not.toHaveClass("bg-warning");
    expect(cpuBar).not.toHaveClass("bg-error");
    expect(cpuBar?.style.width).toBe("80%");
    expect(ramBar).toHaveClass("bg-secondary");
    expect(ramBar?.style.width).toBe("50%");
  });

  test("adds an alert background class to a guest row that breaches the CPU threshold", () => {
    const alertingGuests: PveGuest[] = [
      {
        vmid: 101,
        name: "alpha",
        status: "running",
        cpu: 0.85,
        cpus: 4,
        mem: 2,
        maxmem: 10,
        disk: 10,
        maxdisk: 100,
        uptime: 3_600,
        type: "lxc",
      },
    ];
    const alertingNode: PveNodeDetail = {
      node: { ...node.node, cpu: 0.1 },
      containers: alertingGuests,
      vms: [],
      storage: [],
    };

    render(<NodeCard node={alertingNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} />);
    const row = screen.getByRole("row", { name: /alpha/ });
    expect(row.className).toMatch(/bg-error/);
  });

  test("adds an alert background class to a storage row that breaches the storage threshold", async () => {
    const user = userEvent.setup();
    const storageOnlyNode: PveNodeDetail = {
      ...node,
      vms: [],
      containers: [],
      storage: [{ storage: "local", type: "dir", total: 100, used: 81, avail: 19 }],
    };

    render(<NodeCard node={storageOnlyNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} />);
    await user.click(screen.getByRole("tab", { name: /^Storage/ }));
    const row = screen.getByRole("row", { name: /local/ });
    expect(row.className).toMatch(/bg-error/);
  });

  test("does not highlight rows when all metrics are within thresholds", () => {
    const safeGuests: PveGuest[] = [
      {
        vmid: 101,
        name: "alpha",
        status: "running",
        cpu: 0.5,
        cpus: 4,
        mem: 2,
        maxmem: 10,
        disk: 10,
        maxdisk: 100,
        uptime: 3_600,
        type: "lxc",
      },
    ];
    const safeNode: PveNodeDetail = {
      node: { ...node.node, cpu: 0.1 },
      containers: safeGuests,
      vms: [],
      storage: [],
    };

    render(<NodeCard node={safeNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} />);
    const row = screen.getByRole("row", { name: /alpha/ });
    expect(row.className).not.toMatch(/bg-error/);
  });

  test("does not highlight stopped guests even when their retained values breach thresholds", () => {
    const stoppedGuests: PveGuest[] = [
      {
        vmid: 101,
        name: "alpha",
        status: "stopped",
        cpu: 0.85,
        cpus: 4,
        mem: 2,
        maxmem: 10,
        disk: 80,
        maxdisk: 100,
        uptime: 3_600,
        type: "lxc",
      },
    ];
    const stoppedNode: PveNodeDetail = {
      node: { ...node.node, cpu: 0.1 },
      containers: stoppedGuests,
      vms: [],
      storage: [],
    };

    render(<NodeCard node={stoppedNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} />);
    const row = screen.getByRole("row", { name: /alpha/ });
    expect(row.className).not.toMatch(/bg-error/);
    expect(row.className).not.toMatch(/bg-warning/);
    expect(screen.queryByText(/^cpu 85%$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^storage 80%$/i)).not.toBeInTheDocument();
  });
});

describe("NodeCard breach-only mode", () => {
  const mixedGuests: PveGuest[] = [
    {
      vmid: 101,
      name: "alpha",
      status: "running",
      cpu: 0.85,
      cpus: 4,
      mem: 2,
      maxmem: 10,
      disk: 10,
      maxdisk: 100,
      uptime: 3_600,
      type: "lxc",
    },
    {
      vmid: 202,
      name: "Zulu",
      status: "running",
      cpu: 0.1,
      cpus: 2,
      mem: 2,
      maxmem: 10,
      disk: 10,
      maxdisk: 100,
      uptime: 3_600,
      type: "lxc",
    },
  ];

  const mixedStorage: PveStoragePool[] = [
    { storage: "zfs-data", type: "zfspool", total: 100, used: 81, avail: 19 },
    { storage: "local", type: "dir", total: 100, used: 20, avail: 80 },
  ];

  const mixedNode: PveNodeDetail = {
    node: { ...node.node, cpu: 0.1 },
    containers: mixedGuests,
    vms: mixedGuests.map((g) => ({ ...g, type: "vm" as const })),
    storage: mixedStorage,
  };

  test("hides non-breaching guests and storage in breach-only mode", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={mixedNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} breachOnly />);
    expect(screen.getByRole("row", { name: /alpha/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /Zulu/ })).toBeNull();

    await user.click(screen.getByRole("tab", { name: /^Storage/ }));
    expect(screen.getByRole("row", { name: /zfs-data/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /local/ })).toBeNull();
  });

  test("auto-expands a node card in breach-only mode", () => {
    render(<NodeCard node={mixedNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} breachOnly />);
    const disclosure = screen.getByRole("button", { name: /^pve-1 online/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
  });

  test("surfaces breach reason chips with the breached metric and percentage", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={mixedNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} breachOnly />);
    const alphaRow = screen.getByRole("row", { name: /alpha/ });
    expect(within(alphaRow).getByText("cpu 85%")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /^Storage/ }));
    const zfsRow = screen.getByRole("row", { name: /zfs-data/ });
    expect(within(zfsRow).getByText("storage 81%")).toBeTruthy();
  });

  test("shows breach-only empty state when the selected tab has no breaches", () => {
    const noBreachNode: PveNodeDetail = {
      node: { ...node.node, cpu: 0.1 },
      containers: guests,
      vms: guests.map((g) => ({ ...g, type: "vm" as const })),
      storage,
    };
    render(<NodeCard node={noBreachNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} breachOnly />);
    expect(screen.getByText("No LXC containers are breaching thresholds")).toBeTruthy();
  });

  test("allows collapse override while in breach-only mode", async () => {
    const user = userEvent.setup();
    render(<NodeCard node={mixedNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} breachOnly />);

    const disclosure = screen.getByRole("button", { name: /^pve-1 online/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("row")).toBeNull();
  });

  test("stays in breach-only mode when auto-selecting a tab with breaches", () => {
    render(<NodeCard node={mixedNode} endpointName="Main Cluster" thresholds={DEFAULT_PVE_THRESHOLDS} breachOnly />);
    // LXC tab is the first available; alpha breaches CPU, so it should be shown.
    expect(screen.getByRole("row", { name: /alpha/ })).toBeTruthy();
  });
});
