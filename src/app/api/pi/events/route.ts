/**
 * GET /api/pi/events — SSE stream for Pi RPC events.
 *
 * All browser connections share the same Pi process.
 * Multiple SSE connections are supported — each subscriber
 * receives all events from the singleton Pi process.
 */

import { NextRequest } from "next/server";
import { piProcessManager } from "@/lib/pi/process-manager";

export const dynamic = "force-dynamic";

function writeSSE(
  controller: ReadableStreamDefaultController,
  data: unknown,
): void {
  const json = JSON.stringify(data);
  controller.enqueue(new TextEncoder().encode(`data: ${json}\n\n`));
}

export async function GET(request: NextRequest): Promise<Response> {
  // Ensure the singleton Pi process is running
  const process = await piProcessManager.getOrCreate();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      writeSSE(controller, {
        type: "connected",
        cwd: process.cwd,
        timestamp: Date.now(),
      });

      const unsubscribe = process.subscribe((event) => {
        try {
          writeSSE(controller, event);
        } catch {
          // Client disconnected
        }
      });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream closed
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(keepalive);
        process.scheduleCleanup();
      });
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
