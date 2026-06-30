/**
 * Unit tests for src/components/toast-provider.tsx
 *
 * Covers:
 *  - Provider renders children unchanged
 *  - showToast enqueues a toast in the DOM
 *  - Toast type affects styling (info / success / error)
 *  - Toast auto-dismisses after 3 seconds
 *  - Clicking a toast dismisses it immediately
 *  - useToast() returns the no-op fallback outside a provider
 */
import { describe, test, expect } from "bun:test";
import { render, screen, act, fireEvent, renderHook } from "@/test-utils/render";
import { ToastProvider, useToast } from "./toast-provider";

describe("ToastProvider", () => {
  test("renders children unchanged", () => {
    render(
      <ToastProvider>
        <div data-testid="child">hello</div>
      </ToastProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent("hello");
  });

  test("exposes showToast via useToast context", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    expect(typeof result.current.showToast).toBe("function");
  });

  test("showToast enqueues a toast in the DOM", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("Saved", "success");
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  test("renders multiple toasts at once", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("first", "info");
      result.current.showToast("second", "error");
    });
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  test("toast type='info' has the surface-container class", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("info-toast", "info");
    });
    const node = screen.getByText("info-toast");
    expect(node.className).toContain("bg-surface-container");
  });

  test("toast type='success' has the primary class", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("success-toast", "success");
    });
    const node = screen.getByText("success-toast");
    expect(node.className).toContain("bg-primary");
  });

  test("toast type='error' has the error class", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("error-toast", "error");
    });
    const node = screen.getByText("error-toast");
    expect(node.className).toContain("bg-error");
  });

  test("defaults type to 'info' when not provided", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("default-type");
    });
    const node = screen.getByText("default-type");
    expect(node.className).toContain("bg-surface-container");
  });

  test("clicking a toast dismisses it immediately", () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("click-to-dismiss");
    });
    const node = screen.getByText("click-to-dismiss");
    fireEvent.click(node);
    expect(screen.queryByText("click-to-dismiss")).toBeNull();
  });

  test("toast auto-dismisses after 3 seconds", async () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    act(() => {
      result.current.showToast("will-disappear");
    });
    expect(screen.getByText("will-disappear")).toBeInTheDocument();
    // Wait for the setTimeout(3000) to fire plus a safety margin.
    await new Promise((r) => setTimeout(r, 3200));
    expect(screen.queryByText("will-disappear")).toBeNull();
  });
});

describe("useToast (outside provider)", () => {
  test("returns a no-op showToast that does not throw", () => {
    const { result } = renderHook(() => useToast());
    expect(typeof result.current.showToast).toBe("function");
    expect(() => result.current.showToast("nope", "info")).not.toThrow();
  });
});
