/**
 * GET /api/agent/events?hostname=X
 *
 * Long-lived SSE stream the agent opens to receive commands from the
 * server. Mirrors the server→agent half of the Go agent's WebSocket
 * connection (cmd/agent/main.go).
 *
 * On connect, the agent registers itself in the in-memory registry.
 * On disconnect, it is unregistered and any in-flight commands for
 * this hostname are rejected.
 */

import { NextRequest } from "next/server";
import { agentRegistry } from "@/lib/agents/registry";
import { agentEvents } from "@/lib/agents/event-stream";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hostname = request.nextUrl.searchParams.get("hostname");
  if (!hostname) {
    return new Response("hostname required", { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Register a "synthetic" WS — we use a minimal interface so the
      // registry's `clients` map can hold an object that supports the
      // subset of WS methods we need (send, readyState).
      const fakeWs = {
        readyState: 1, // OPEN
        send: (data: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            /* stream closed */
          }
        },
        close: () => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
      } as unknown as Parameters<typeof agentRegistry.register>[1];

      agentRegistry.register(hostname, fakeWs, ip);
      console.log(`[agent] ${hostname} connected (SSE)`);

      // Initial hello
      controller.enqueue(
        encoder.encode(
          `event: hello\ndata: ${JSON.stringify({ hostname, ip, ts: Date.now() })}\n\n`
        )
      );

      // Subscribe to events for this hostname and forward to the SSE
      const unsubscribe = agentEvents.subscribe(hostname, (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      });

      // Keep-alive ping every 15s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* closed */
        }
      }, 15_000);

      const cleanup = () => {
        clearInterval(keepalive);
        unsubscribe();
        agentRegistry.unregister(hostname);
        console.log(`[agent] ${hostname} disconnected (SSE)`);
      };

      // Detect client disconnect
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
