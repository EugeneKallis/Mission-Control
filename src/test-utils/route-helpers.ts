/**
 * Helpers for testing Next.js App Router route handlers.
 *
 * Bun's test runner can import the exported GET/POST/PUT/DELETE
 * functions directly — we don't need the full Next.js test harness
 * because the route files only depend on `NextRequest` and
 * `NextResponse`, both of which are part of `next/server`.
 *
 * This means tests run fast, have no dev server, and are
 * hermetic per file (each test file is its own process in bun).
 */
import { NextRequest } from "next/server";

/**
 * Build a NextRequest for GET.
 */
export function getRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

/**
 * Build a NextRequest for POST/PUT/PATCH with a JSON body.
 */
export function jsonRequest(
  url: string,
  body: unknown,
  method: "POST" | "PUT" | "PATCH" = "POST",
): NextRequest {
  // NextRequest's RequestInit type is stricter than the standard lib
  // (no `null` for signal). Cast to satisfy both.
  const init = {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // Bun's fetch needs duplex for streaming bodies.
    duplex: "half",
  } as unknown as ConstructorParameters<typeof NextRequest>[1];
  return new NextRequest(`http://localhost${url}`, init);
}

/**
 * Build a NextRequest for DELETE.
 */
export function deleteRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "DELETE" });
}

/**
 * Parse a route handler's Response body as JSON.
 */
export async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}

/**
 * Read a route handler's Response status.
 */
export function status(res: Response): number {
  return res.status;
}
