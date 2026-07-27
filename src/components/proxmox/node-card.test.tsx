import { describe, expect, test } from "bun:test";
import { render, screen, userEvent } from "@/test-utils/render";
import { NodeCard, sortGuests, sortStorage } from "./node-card";
import type { PveGuest, PveNodeDetail, PveStoragePool } from "./proxmox-types";

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
    const { container } = render(<NodeCard node={node} endpointName="Main Cluster" />);

    await user.click(screen.getByRole("button", { name: /pve-1/i }));

    // Guest tables start in a predictable ID-ascending order.
    expectTextOrder(container, "alpha", "Zulu");

    const nameSort = screen.getByRole("button", { name: /Sort by Name in Main Cluster pve-1 LXC containers/i });
    await user.click(nameSort);
    expectTextOrder(container, "alpha", "Zulu");
    expect(nameSort.parentElement).toHaveAttribute("role", "columnheader");
    expect(nameSort.parentElement).toHaveAttribute("aria-sort", "ascending");

    nameSort.focus();
    await user.keyboard("{Enter}");
    expectTextOrder(container, "Zulu", "alpha");
    expect(nameSort.parentElement).toHaveAttribute("aria-sort", "descending");
  });

  test("wires every guest header to the only active aria-sort state", async () => {
    const user = userEvent.setup();
    const { container } = render(<NodeCard node={node} endpointName="Main Cluster" />);

    await user.click(screen.getByRole("button", { name: /pve-1/i }));

    for (const label of ["ID", "Name", "Status", "CPU", "Memory", "Disk", "Uptime"]) {
      const button = screen.getByRole("button", { name: new RegExp(`Sort by ${label} in Main Cluster pve-1 LXC containers`, "i") });
      await user.click(button);
      const expectedDirection = label === "ID" ? "descending" : "ascending";
      expect(button.parentElement).toHaveAttribute("role", "columnheader");
      expect(button.parentElement).toHaveAttribute("aria-sort", expectedDirection);
      expect(container.querySelectorAll('[role="columnheader"][aria-sort]')).toHaveLength(1);
    }
  });

  test("keeps VM and LXC sort choices independent", async () => {
    const user = userEvent.setup();
    const { container } = render(<NodeCard node={node} endpointName="Main Cluster" />);

    await user.click(screen.getByRole("button", { name: /pve-1/i }));
    await user.click(screen.getByRole("button", { name: /Sort by Name in Main Cluster pve-1 LXC containers/i }));
    await user.click(screen.getByRole("button", { name: /Sort by Name in Main Cluster pve-1 LXC containers/i }));
    expectTextOrder(container, "Zulu", "alpha");

    await user.click(screen.getByRole("button", { name: /^VMs/ }));
    expectTextOrder(container, "alpha", "Zulu");
    expect(screen.getByRole("button", { name: /Sort by ID in Main Cluster pve-1 VMs, currently ascending/i })).toBeTruthy();
  });

  test("wires every storage header to the only active aria-sort state", async () => {
    const user = userEvent.setup();
    const { container } = render(<NodeCard node={node} endpointName="Main Cluster" />);

    await user.click(screen.getByRole("button", { name: /pve-1/i }));
    await user.click(screen.getByRole("button", { name: /^Storage/ }));

    for (const label of ["Name", "Type", "Usage", "Free"]) {
      const button = screen.getByRole("button", { name: new RegExp(`Sort by ${label} in Main Cluster pve-1 storage`, "i") });
      await user.click(button);
      const expectedDirection = label === "Name" ? "descending" : "ascending";
      expect(button.parentElement).toHaveAttribute("role", "columnheader");
      expect(button.parentElement).toHaveAttribute("aria-sort", expectedDirection);
      expect(container.querySelectorAll('[role="columnheader"][aria-sort]')).toHaveLength(1);
    }
  });

  test("sorts storage rows by usage and toggles direction", async () => {
    const user = userEvent.setup();
    const { container } = render(<NodeCard node={node} endpointName="Main Cluster" />);

    await user.click(screen.getByRole("button", { name: /pve-1/i }));
    await user.click(screen.getByRole("button", { name: /^Storage/ }));

    // Storage starts by name ascending.
    expectTextOrder(container, "local", "zfs-data");

    const usageSort = screen.getByRole("button", { name: /Sort by Usage in Main Cluster pve-1 storage/i });
    await user.click(usageSort);
    expectTextOrder(container, "zfs-data", "local");
    expect(usageSort.parentElement).toHaveAttribute("aria-sort", "ascending");

    await user.click(usageSort);
    expectTextOrder(container, "local", "zfs-data");
    expect(usageSort.parentElement).toHaveAttribute("aria-sort", "descending");
  });
});
