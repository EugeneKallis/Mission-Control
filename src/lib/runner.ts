/**
 * Macro execution engine.
 * Port of ~/ServerTool/cmd/web/handler/command.go RunMacro.
 *
 * Runs a macro's commands either locally (via child_process.spawn, so it
 * works in both Node and Bun) or remotely via the agent registry. Streams
 * all output through the shared LiveBus so connected home-page terminals
 * see live output.
 */

import { spawn } from "child_process";
import { getMacro, createHistory, updateHistory, flushHistoryOutput } from "@/lib/db/queries";
import { liveBus } from "@/lib/live-bus";
import { agentRegistry } from "@/lib/agents/registry";
import type { MacroCommand } from "@/types";

/** How often the runner flushes partial output to the history row
 *  while a macro is running. 1.5 s is short enough that the history
 *  tab feels live even for short macros, and long enough that we
 *  don't hammer the DB with writes for chatty commands. */
const FLUSH_INTERVAL_MS = 1500;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Decode a Uint8Array chunk to string. */
function decodeChunk(chunk: Uint8Array): string {
  return new TextDecoder().decode(chunk);
}

// ── Main runner ────────────────────────────────────────────────────────────

export async function runMacro(
  macroId: number,
  triggeredBy: string,
  agentHostname?: string,
): Promise<{ historyId: number; status: string }> {
  // 1. Load macro
  const macro = await getMacro(macroId);

  // 2. Create history record
  const history = await createHistory({
    macroId: macro.id,
    startTime: new Date(),
    status: "running",
    triggeredBy,
    output: "",
  });

  // 3. Resolve agent hostname. The URL `?agent=` override only applies
  //    to macros that are actually flagged for agent execution — for
  //    local macros we ignore it so a stale `agentHostname` on the row
  //    can't cause the runner to print a misleading "Node:" header and
  //    then fall through to local execution.
  const resolvedAgent = macro.runOnAgent
    ? (agentHostname || macro.agentHostname || "")
    : "";

  // 4. Parse commands
  let commands: MacroCommand[] = [];
  try {
    commands = JSON.parse(macro.commands || "[]");
  } catch {
    commands = [];
  }

  // 5. Build output buffer (concatenated for history storage) and
  //    track whether new output needs to be flushed to the DB. The
  //    flush interval below picks up dirty=true runs every 1.5 s so
  //    /history/[id] can show partial output for an in-flight macro
  //    without waiting for the final updateHistory() call.
  const chunks: string[] = [];
  let dirty = false;
  let flushInterval: ReturnType<typeof setInterval> | null = null;

  function markDirty() {
    dirty = true;
  }

  function write(msg: string) {
    const chunk = msg.endsWith("\n") ? msg : msg + "\n";
    liveBus.publish({
      type: "output",
      text: chunk,
      macroId,
      timestamp: Date.now(),
    });
    chunks.push(chunk);
    markDirty();
  }

  // Flush the chunks buffer to the DB on a short interval so the
  // history tab can show partial output for a still-running macro.
  // The dirty flag short-circuits idle ticks. On flush failure we
  // leave dirty=true so the next tick retries; the final
  // updateHistory() in each exit path is the authoritative write
  // either way. cleared in the finally block below.
  flushInterval = setInterval(async () => {
    if (!dirty) return;
    const output = chunks.join("");
    try {
      await flushHistoryOutput(history.id, output);
      dirty = false;
    } catch (err) {
      console.error(`[runMacro] Failed to flush history ${history.id}:`, err);
    }
  }, FLUSH_INTERVAL_MS);

  // 6. Header
  try {
  write(`=== Running Macro: ${macro.name} ===`);
  if (macro.description) {
    write(`Description: ${macro.description}`);
  }
  write(`Triggered By: ${triggeredBy}`);
  if (macro.runOnAgent && resolvedAgent) {
    write(`Node: ${resolvedAgent}`);
  }
  write("");

  // 7. Run macro on agent
  if (macro.runOnAgent) {
    if (!resolvedAgent) {
      write(
        "ERROR: This macro is configured to run on an agent, but no agent was selected.",
      );
      write("=== FAILED ===");
      const finalOutput = chunks.join("");
      await updateHistory(history.id, {
        endTime: new Date(),
        status: "failed",
        output: finalOutput,
      });
      return { historyId: history.id, status: "failed" };
    }

    if (!agentRegistry.isConnected(resolvedAgent)) {
      write(
        `ERROR: Agent ${resolvedAgent} is not connected. Run: curl -sL <server>/api/agent/install | sudo bash -s`,
      );
      write("=== FAILED ===");
      const finalOutput = chunks.join("");
      await updateHistory(history.id, {
        endTime: new Date(),
        status: "failed",
        output: finalOutput,
      });
      return { historyId: history.id, status: "failed" };
    }

    // Dispatch each command to the agent and stream output through the
    // live bus + the history buffer. The agent's SSE stream receives
    // the command; the agent POSTs output/exit to /api/agent/result.
    let agentFailed = false;
    for (const mc of commands) {
      write(`> ${mc.cmd}`);

      try {
        const final = await agentRegistry.dispatch(resolvedAgent, mc.cmd, {
          dir: mc.working_dir,
          timeoutMs: 5 * 60 * 1000, // 5 minutes per command, matches Go
          onChunk: (text) => {
            liveBus.publish({
              type: "output",
              text,
              macroId,
              timestamp: Date.now(),
            });
            chunks.push(text);
            markDirty();
          },
          onExit: (exitCode) => {
            if (exitCode !== 0) {
              write(`\nCommand failed with exit code ${exitCode}`);
            } else {
              write("");
            }
          },
        });

        if (final.type === "exit" && final.exitCode !== 0) {
          write("=== FAILED ===");
          const finalOutput = chunks.join("");
          await updateHistory(history.id, {
            endTime: new Date(),
            status: "failed",
            output: finalOutput,
          });
          return { historyId: history.id, status: "failed" };
        }
        if (final.type === "error") {
          write(`[agent error: ${final.payload ?? "unknown"}]`);
          write("=== FAILED ===");
          const finalOutput = chunks.join("");
          await updateHistory(history.id, {
            endTime: new Date(),
            status: "failed",
            output: finalOutput,
          });
          return { historyId: history.id, status: "failed" };
        }
      } catch (err) {
        write(`[dispatch error: ${err instanceof Error ? err.message : String(err)}]`);
        agentFailed = true;
        break;
      }
    }

    if (agentFailed) {
      write("=== FAILED ===");
      const finalOutput = chunks.join("");
      await updateHistory(history.id, {
        endTime: new Date(),
        status: "failed",
        output: finalOutput,
      });
      return { historyId: history.id, status: "failed" };
    }

    // All commands succeeded
    write("=== DONE ===");
    const finalOutput = chunks.join("");
    await updateHistory(history.id, {
      endTime: new Date(),
      status: "success",
      output: finalOutput,
    });
    return { historyId: history.id, status: "success" };
  }

  // 8. Execute commands locally. Uses child_process.spawn (available in
  //    both Node and Bun) so the runner doesn't blow up if the dev server
  //    is started under Node, or if the Next.js bundler strips the
  //    `Bun` global from the runtime context.
  let finalized = false;
  try {
    for (const mc of commands) {
      write(`> ${mc.cmd}`);

      const proc = spawn("bash", ["-c", mc.cmd], {
        cwd: mc.working_dir || process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Stream stdout
      proc.stdout.on("data", (chunk: Buffer) => {
        const text = decodeChunk(new Uint8Array(chunk));
        liveBus.publish({
          type: "output",
          text,
          macroId,
          timestamp: Date.now(),
        });
        chunks.push(text);
        markDirty();
      });

      // Stream stderr
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = decodeChunk(new Uint8Array(chunk));
        liveBus.publish({
          type: "output",
          text,
          macroId,
          timestamp: Date.now(),
        });
        chunks.push(text);
        markDirty();
      });

      // Wait for the process to exit. Surface spawn errors as a failed
      // macro run rather than a thrown exception, so the history row
      // gets the right status and output.
      const exitCode: number = await new Promise((resolve) => {
        proc.on("error", (err) => {
          write(`[spawn error: ${err.message}]`);
          resolve(1);
        });
        proc.on("close", (code) => resolve(code ?? 0));
      });

      if (exitCode !== 0) {
        write(`\nCommand failed with exit code ${exitCode}`);
        write("=== FAILED ===");
        const finalOutput = chunks.join("");
        await updateHistory(history.id, {
          endTime: new Date(),
          status: "failed",
          output: finalOutput,
        });
        finalized = true;
        return { historyId: history.id, status: "failed" };
      }

      write("");
    }

    // 9. All commands succeeded
    write("=== DONE ===");
    const finalOutput = chunks.join("");
    await updateHistory(history.id, {
      endTime: new Date(),
      status: "success",
      output: finalOutput,
    });
    finalized = true;
    return { historyId: history.id, status: "success" };
  } catch (err) {
    if (!finalized) {
      try {
        write(`[runner error: ${String(err)}]`);
        write("=== FAILED ===");
        await updateHistory(history.id, {
          endTime: new Date(),
          status: "failed",
          output: chunks.join("") + `\n[runner error: ${String(err)}]\n`,
        });
      } catch (updateErr) {
        console.error("Failed to mark history as failed:", updateErr);
      }
    }
    throw err;
  }
  } finally {
    // Always stop the flush interval — the final updateHistory() in
    // each exit path above has already (or is about to) write the
    // authoritative state, so further ticks would be wasted work.
    if (flushInterval) {
      clearInterval(flushInterval);
      flushInterval = null;
    }
  }
}
