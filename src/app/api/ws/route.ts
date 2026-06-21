/**
 * Server-Sent Events endpoint for live terminal output streaming.
 *
 * Clients connect via EventSource to receive real-time macro output.
 * The liveBus singleton fans out messages to every connected client.
 *
 * GET /api/ws
 */

import { liveBus } from "@/lib/live-bus";

/** Write an SSE-formatted message to the response stream. */
function writeSSE(
  controller: ReadableStreamDefaultController,
  data: unknown,
): void {
  const json = JSON.stringify(data);
  controller.enqueue(new TextEncoder().encode(`data: ${json}\n\n`));
}

export async function GET(request: Request): Promise<Response> {
  const signal = request.signal;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      writeSSE(controller, {
        type: "status",
        text: "CONNECTED",
        timestamp: Date.now(),
      });

      // Subscribe to the live bus
      const unsubscribe = liveBus.subscribe((msg) => {
        try {
          writeSSE(controller, msg);
        } catch {
          // Client likely disconnected
        }
      });

      // Keep-alive ping every 15 seconds (prevents proxy timeouts)
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          // Stream closed
        }
      }, 15_000);

      // Cleanup on client disconnect
      signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(keepalive);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
