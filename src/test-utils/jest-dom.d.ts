/**
 * Augments bun:test's Matchers interface with @testing-library/jest-dom
 * matchers (toBeInTheDocument, toHaveClass, toBeDisabled, etc.) so they
 * type-check in component tests.
 *
 * @testing-library/jest-dom ships a `bun.d.ts` for this, but it's not
 * exposed via the package's exports map. We replicate the same module
 * augmentation here by importing the matchers type from the published
 * types and re-declaring the module shape.
 */
import { type expect as bunExpect } from "bun:test";
import { type TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "bun:test" {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<typeof bunExpect.stringContaining, T> {}
}

export {};
