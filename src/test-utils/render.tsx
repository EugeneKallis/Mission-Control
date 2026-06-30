/**
 * Shared render helper for component tests.
 *
 * happy-dom is registered globally via the bunfig.toml preload
 * (./src/test-utils/preload.ts), so any test file (tsx or ts) sees a
 * real `document` from the moment it starts running.
 *
 * Wraps @testing-library/react's render so we can add providers
 * (Router, Toast, etc.) in one place if/when component tests need them.
 *
 * Cleanup: @testing-library/react 16.3+ auto-registers
 * `afterEach(cleanup)`. Test files that render React portals should
 * not need extra cleanup — RTL's cleanup unmounts the entire tree,
 * including portal siblings.
 */
import React from "react";
import {
  render as rtlRender,
  type RenderOptions,
} from "@testing-library/react";

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function render(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return rtlRender(ui, { wrapper: AllTheProviders, ...options });
}

// Re-export everything from RTL so test files can
// `import { render, screen, fireEvent } from "@/test-utils/render"`.
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
