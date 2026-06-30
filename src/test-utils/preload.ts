/**
 * Preload runs before every test file (configured in bunfig.toml).
 *
 * Three responsibilities:
 *  1. Register a global DOM (window, document, HTMLElement) via
 *     happy-dom. This must happen BEFORE any test file imports
 *     @testing-library/dom (directly or transitively via
 *     @testing-library/react). The `screen` object exported by
 *     @testing-library/dom captures `document.body` at the moment it
 *     is first evaluated — if `document.body` is undefined then,
 *     every `screen.*` query throws "For queries bound to document.body
 *     a global document has to be available" forever (the binding is
 *     sticky).
 *  2. Extend bun:test's expect with jest-dom matchers
 *     (.toBeInTheDocument, etc.) so component tests can use them.
 *  3. Silence `console.error` in test runs. Route handlers log
 *     caught errors via `console.error` before returning a 5xx, which
 *     is correct behaviour in production but floods test output with
 *     formatted stack traces interleaved with the per-test pass/fail
 *     lines (Bun's reporter prints them before the (pass) line, so
 *     the noise looks like a failure). The original implementation
 *     is preserved on `console.error.__original` so individual tests
 *     that need to assert on the log can restore it temporarily.
 *
 * Note on .ts tests: pure TS tests (e.g. decypharr's blob-upload test)
 * also get happy-dom registered, which means FormData/Blob/File are
 * happy-dom's classes (not Bun's native). happy-dom's File class does
 * not preserve the `name` passed via `form.append(blob, name)` the
 * way Bun's native does, so any test that asserts on `file.name` from
 * a FormData result was updated to check something happy-dom actually
 * preserves (the existence of the entry, not its name).
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";

// Guard against re-registration when this preload is loaded by a
// test file that also imports the same module (or by other preloads).
declare global {
  // eslint-disable-next-line no-var
  var __happyDomRegistered: boolean | undefined;
  // eslint-disable-next-line no-var
  var __consoleErrorSilenced: boolean | undefined;
}

if (!globalThis.__happyDomRegistered) {
  GlobalRegistrator.register();
  globalThis.__happyDomRegistered = true;
}

expect.extend(matchers);

// Silence console.error in test mode. See header (point 3) for rationale.
// Guarded with a flag so re-imports during a test run don't wrap the
// already-wrapped function.
if (!globalThis.__consoleErrorSilenced) {
  type ConsoleErrorWithOriginal = typeof console.error & {
    __original?: (...args: unknown[]) => void;
  };
  const original = console.error.bind(console) as ConsoleErrorWithOriginal;
  // Attach __original to the SILENCED stub (not the original) so that
  // `console.error.__original` remains readable after we replace the
  // function below. Otherwise the property would be lost with the swap.
  const stub = (() => {
    // no-op; original preserved via __original for tests that need it
  }) as ConsoleErrorWithOriginal;
  stub.__original = original;
  console.error = stub;
  globalThis.__consoleErrorSilenced = true;
}
