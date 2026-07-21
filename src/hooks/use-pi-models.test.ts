/**
 * Unit tests for src/hooks/use-pi-models.ts
 *
 * Covers:
 *  - fetch success → models populated, loading false
 *  - fetch error → error set, models empty, loading false
 *  - 404 then 200 → retries on 404 then resolves with models
 *  - unmount during pending fetch → no state update after unmount
 *
 * Mirrors the fetch-mock style of `model-selector.test.tsx`:
 * `globalThis.fetch` is swapped in each test and restored in afterEach.
 */
import { describe, test, expect, afterEach, beforeEach, mock } from "bun:test";
import { renderHook, waitFor } from "@/test-utils/render";
import { usePiModels, type PiModelEntry } from "./use-pi-models";

const MOCK_MODELS: PiModelEntry[] = [
  {
    id: "opencode-go/deepseek-v4-flash",
    provider: "opencode-go",
    providerLabel: "OpenCode Go",
    name: "DeepSeek V4 Flash",
    capabilities: ["text", "tools", "reasoning"],
    inputPricePerM: 0.14,
    outputPricePerM: 0.28,
    contextWindow: 1_000_000,
    configured: true,
  },
  {
    id: "openai/gpt-4o",
    provider: "openai",
    providerLabel: "OpenAI",
    name: "GPT-4o",
    capabilities: ["text", "vision", "tools"],
    inputPricePerM: 2.5,
    outputPricePerM: 10,
    contextWindow: 128_000,
    configured: true,
  },
];

let originalFetch: typeof globalThis.fetch;
let originalSetTimeout: typeof globalThis.setTimeout;

// Track the active hook render so afterEach can unmount it. Each test
// either assigns `activeUnmount` from renderHook, or sets it to
// `undefined` after unmounting manually.
let activeUnmount: (() => void) | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalSetTimeout = globalThis.setTimeout;
});

afterEach(() => {
  if (activeUnmount) {
    activeUnmount();
    activeUnmount = undefined;
  }
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

describe("usePiModels", () => {
  test("fetch success → models populated, loading false", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ models: MOCK_MODELS }))),
    ) as unknown as typeof globalThis.fetch;

    const { result, unmount } = renderHook(() => usePiModels(true));
    activeUnmount = unmount;

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.models).toHaveLength(2);
    expect(result.current.models[0].name).toBe("DeepSeek V4 Flash");
  });

  test("fetch error → error set, models empty", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("Network down"))) as unknown as typeof globalThis.fetch;

    const { result, unmount } = renderHook(() => usePiModels(true));
    activeUnmount = unmount;

    await waitFor(() => {
      expect(result.current.error).toBe("Network down");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.models).toEqual([]);
  });

  test("404 then 200 → retries then resolves", async () => {
    // Real 2s backoff: we accept the ~2s cost (matches the style in
    // `use-live-stream.test.ts`) because mocking `setTimeout` breaks
    // RTL's `waitFor` internals. Use a generous `waitFor` timeout so
    // the assertion survives the retry cadence.
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ models: MOCK_MODELS })),
      );
    }) as unknown as typeof globalThis.fetch;

    const start = Date.now();
    const { result, unmount } = renderHook(() => usePiModels(true));
    activeUnmount = unmount;

    await waitFor(
      () => {
        expect(result.current.models).toHaveLength(2);
      },
      { timeout: 5000 },
    );
    expect(callCount).toBe(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(Date.now() - start).toBeGreaterThanOrEqual(2000);
  });

  test("unmount during pending fetch → no state update after unmount", async () => {
    let resolveFetch: (value: Response) => void;
    globalThis.fetch = mock(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    ) as unknown as typeof globalThis.fetch;

    const errorSpy = mock(() => {});
    const consoleError = console.error;
    console.error = errorSpy;

    const { result, unmount } = renderHook(() => usePiModels(true));
    expect(result.current.loading).toBe(true);
    expect(result.current.models).toEqual([]);
    unmount();
    activeUnmount = undefined;

    // Resolve the fetch AFTER unmount — the cancelled flag should
    // prevent setModels/setLoading calls, so React won't log a
    // "setState on unmounted component" warning.
    resolveFetch!(new Response(JSON.stringify({ models: MOCK_MODELS })));

    await new Promise<void>((r) => originalSetTimeout(() => r(), 50));

    console.error = consoleError;

    expect(result.current.loading).toBe(true);
    expect(result.current.models).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
