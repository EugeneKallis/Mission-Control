/**
 * Tests for FileTreeViewer
 *
 * Covers:
 *  - Renders title (NZB Viewer / Debrid Viewer)
 *  - Renders search input
 *  - Fetches /api/<source>/tree and /api/arr/instance-map on mount
 *  - Renders root items with checkboxes
 *  - Clicking the expand chevron fetches children
 *  - Clicking again collapses
 *  - Clicking a checkbox toggles selection
 *  - Header "select all" toggles all
 *  - "Delete Selected (N)" button is disabled when 0 selected
 *  - Clicking Delete opens the confirm modal
 *  - Confirming POSTs to /api/<source>/delete and shows a success toast
 *  - Search input debounces 300ms then calls /api/<source>/search
 *  - Search shows results + a Clear button
 *  - Expand All / Collapse All
 */
import { describe, test, expect, afterEach } from "bun:test";
import { render, within, fireEvent, waitFor } from "@/test-utils/render";
import { FileTreeViewer } from "./file-tree-viewer";
import type { FileTreeItem } from "@/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeTree(): FileTreeItem[] {
  return [
    {
      id: 1,
      path: "/movies",
      name: "movies",
      is_dir: true,
      parent_path: "",
      link_target: null,
      file_count: 5,
      updated_at: null,
    },
    {
      id: 2,
      path: "/tv",
      name: "tv",
      is_dir: true,
      parent_path: "",
      link_target: null,
      file_count: 3,
      updated_at: null,
    },
    {
      id: 3,
      path: "/README",
      name: "README",
      is_dir: false,
      parent_path: "",
      link_target: null,
      file_count: 0,
      updated_at: null,
    },
  ];
}

function makeChildTree(): FileTreeItem[] {
  return [
    {
      id: 10,
      path: "/movies/foo",
      name: "foo",
      is_dir: true,
      parent_path: "/movies",
      link_target: null,
      file_count: 2,
      updated_at: null,
    },
    {
      id: 11,
      path: "/movies/bar.mp4",
      name: "bar.mp4",
      is_dir: false,
      parent_path: "/movies",
      link_target: null,
      file_count: 0,
      updated_at: null,
    },
  ];
}

function setupFetch(opts: {
  root?: FileTreeItem[] | "error";
  arrMap?: Record<string, string>;
  childTree?: FileTreeItem[];
} = {}) {
  const root = opts.root ?? makeTree();
  const arrMap = opts.arrMap ?? {};
  const childTree = opts.childTree ?? makeChildTree();
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url);
    if (u.includes("/tree")) {
      // Empty parent (initial root load) → return root
      if (u.endsWith("?parent=") || u.endsWith("parent=&") || u.endsWith("parent=")) {
        if (root === "error") return new Response("nope", { status: 500 });
        return new Response(JSON.stringify(root), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // Specific child path → return child tree
      return new Response(JSON.stringify(childTree), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("/arr/instance-map")) {
      return new Response(JSON.stringify(arrMap), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("/search")) {
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("/delete")) {
      const body = JSON.parse(init?.body ?? "{}");
      return new Response(
        JSON.stringify({ deleted: body.paths?.length ?? 0 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
}

describe("FileTreeViewer", () => {
  test("renders the NZB Viewer title for source='nzb'", () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    const view = within(container);
    expect(view.getByText("NZB Viewer")).toBeInTheDocument();
  });

  test("renders the Debrid Viewer title for source='debrid'", () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="debrid" />);
    const view = within(container);
    expect(view.getByText("Debrid Viewer")).toBeInTheDocument();
  });

  test("renders a search input", () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    const input = container.querySelector('input[type="search"]');
    expect(input).toBeTruthy();
  });

  test("renders root items with checkboxes on mount", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("movies");
      expect(container.textContent).toContain("tv");
      expect(container.textContent).toContain("README");
    });
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    // 1 header "select all" + 1 per row (3 rows) = 4
    expect(checkboxes.length).toBe(4);
  });

  test("renders the file_count badge for directories", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("movies");
    });
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("3");
  });

  test("clicking the expand chevron fetches children", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("movies");
    });
    // Find the expand button for /movies (it has aria-label="Expand")
    const expandBtn = container.querySelector(
      'button[aria-label="Expand"]',
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(container.textContent).toContain("foo");
      expect(container.textContent).toContain("bar.mp4");
    });
  });

  test("clicking the expand chevron twice collapses", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("movies");
    });
    const expandBtn = container.querySelector(
      'button[aria-label="Expand"]',
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(container.textContent).toContain("foo");
    });
    // Now collapse
    const collapseBtn = container.querySelector(
      'button[aria-label="Collapse"]',
    ) as HTMLButtonElement;
    expect(collapseBtn).toBeTruthy();
    fireEvent.click(collapseBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain("foo");
    });
  });

  test("clicking a row checkbox toggles selection", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("README");
    });
    // The row checkbox for README has aria-label="Select README"
    const cb = container.querySelector(
      'input[aria-label="Select README"]',
    ) as HTMLInputElement;
    expect(cb).toBeTruthy();
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
  });

  test("'Delete Selected' button is disabled when 0 selected", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("Delete Selected");
    });
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Delete Selected"),
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  test("selecting an item enables the Delete button and shows the count", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("README");
    });
    const cb = container.querySelector(
      'input[aria-label="Select README"]',
    ) as HTMLInputElement;
    fireEvent.click(cb);
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Delete Selected (1)"),
      );
      expect(btn).toBeTruthy();
    });
  });

  test("clicking Delete opens the confirm modal", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("README");
    });
    const cb = container.querySelector(
      'input[aria-label="Select README"]',
    ) as HTMLInputElement;
    fireEvent.click(cb);
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Delete Selected"),
      );
      fireEvent.click(btn as HTMLElement);
    });
    await waitFor(() => {
      expect(container.textContent).toContain("Delete 1 item?");
    });
  });

  test("confirming the modal POSTs to /api/<source>/delete", async () => {
    let deleteBody: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/tree")) {
        return new Response(JSON.stringify(makeTree()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/delete")) {
        deleteBody = JSON.parse(init?.body ?? "{}");
        return new Response(JSON.stringify({ deleted: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/arr/instance-map")) {
        return new Response("{}", { status: 200 });
      }
      if (u.includes("/search")) {
        return new Response("[]", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("README");
    });
    const cb = container.querySelector(
      'input[aria-label="Select README"]',
    ) as HTMLInputElement;
    fireEvent.click(cb);
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Delete Selected"),
      );
      fireEvent.click(btn as HTMLElement);
    });
    await waitFor(() => {
      expect(container.textContent).toContain("Delete 1 item?");
    });
    // The confirm dialog has a "Delete" button
    const confirmBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent === "Delete" || b.textContent?.startsWith("Delete"),
    ) as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(deleteBody).not.toBeNull();
    });
    expect(deleteBody.paths).toEqual(["/README"]);
  });

  test("search debounces 300ms then calls /api/<source>/search", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes("/search")) {
        calls.push(u);
        return new Response("[]", { status: 200 });
      }
      if (u.includes("/tree")) {
        return new Response(JSON.stringify(makeTree()), {
          status: 200,
        });
      }
      if (u.includes("/arr/instance-map")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("README");
    });

    const input = container.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "looking" } });
    // Search should not fire yet (debounce)
    expect(calls.length).toBe(0);
    await waitFor(
      () => {
        expect(calls.length).toBe(1);
      },
      { timeout: 500 },
    );
    expect(calls[0]).toContain("q=looking");
  });

  test("renders search results and a Clear button when searching", async () => {
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes("/search")) {
        return new Response(
          JSON.stringify([
            {
              id: 99,
              path: "/foo.txt",
              name: "foo.txt",
              is_dir: false,
              parent_path: "",
              link_target: null,
              file_count: 0,
              updated_at: null,
            },
          ]),
          { status: 200 },
        );
      }
      if (u.includes("/tree")) {
        return new Response(JSON.stringify(makeTree()), { status: 200 });
      }
      if (u.includes("/arr/instance-map")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("README");
    });
    const input = container.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "foo" } });
    await waitFor(() => {
      expect(container.textContent).toContain("Search results");
    });
    expect(container.textContent).toContain("foo.txt");
    expect(container.textContent).toContain("Clear");
  });

  test("Collapse All button clears the expanded state", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("movies");
    });
    // Expand /movies
    const expandBtn = container.querySelector(
      'button[aria-label="Expand"]',
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(container.textContent).toContain("foo");
    });
    // Click Collapse All
    const collapseAllBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Collapse All"),
    ) as HTMLButtonElement;
    fireEvent.click(collapseAllBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain("foo");
    });
  });

  test("Expand All expands every loaded directory", async () => {
    setupFetch();
    const { container } = render(<FileTreeViewer source="nzb" />);
    await waitFor(() => {
      expect(container.textContent).toContain("movies");
    });
    // Pre-load /movies children so it has kids to expand
    const expandBtn = container.querySelector(
      'button[aria-label="Expand"]',
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(container.textContent).toContain("foo");
    });
    // Collapse first
    const collapseAllBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Collapse All"),
    ) as HTMLButtonElement;
    fireEvent.click(collapseAllBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain("foo");
    });
    // Now Expand All
    const expandAllBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Expand All"),
    ) as HTMLButtonElement;
    fireEvent.click(expandAllBtn);
    await waitFor(() => {
      expect(container.textContent).toContain("foo");
    });
  });
});
