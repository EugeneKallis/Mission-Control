/**
 * Test helper for assertions on console.error output.
 *
 * The preload (`src/test-utils/preload.ts`) silences console.error
 * globally for tests because route handlers log caught errors via
 * `console.error(...)` before returning 5xx, which floods the test
 * reporter. The original implementation is preserved on
 * `console.error.__original`.
 *
 * Tests that DO need to assert on a logged error should call
 * `captureConsoleError()` to swap the silenced stub for a Jest-style
 * spy, drive the code under test, then call the returned `restore()`
 * function in `afterEach` (or after the assertion).
 *
 * Example:
 *   let capture: { logs: unknown[][]; restore: () => void };
 *   beforeEach(() => { capture = captureConsoleError(); });
 *   afterEach(() => capture.restore());
 *   test("logs the error", async () => {
 *     await callTheHandler();
 *     expect(capture.logs[0]?.[0]).toBe("Failed to update group:");
 *   });
 */

type ConsoleErrorFn = (...args: unknown[]) => void;
type SilencedConsoleError = ConsoleErrorFn & { __original?: ConsoleErrorFn };

export interface ConsoleErrorCapture {
  /** Each `console.error(...)` call appends one entry: the array of args. */
  logs: unknown[][];
  /** Restore the preload's silent stub. Call this in afterEach. */
  restore: () => void;
}

/**
 * Swap the silenced `console.error` for a spy that records calls.
 * Returns the captured log buffer and a `restore` function.
 *
 * Idempotent within a test: calling it twice returns the same capture
 * (the second call just resets `logs`).
 */
export function captureConsoleError(): ConsoleErrorCapture {
  const logs: unknown[][] = [];
  const original = (console.error as SilencedConsoleError).__original;
  if (!original) {
    throw new Error(
      "captureConsoleError: preload did not register __original. " +
        "Did the preload not run? (check bunfig.toml [test] preload)"
    );
  }
  console.error = ((...args: unknown[]) => {
    logs.push(args);
  }) as ConsoleErrorFn;
  return {
    logs,
    restore: () => {
      console.error = original as ConsoleErrorFn;
    },
  };
}
