/**
 * Macro execution engine.
 * Port of ~/ServerTool/cmd/web/handler/command.go RunMacro.
 *
 * Runs a macro's commands either locally (via Bun.spawn) or remotely
 * via an agent (stubbed until Part 11). Streams all output through
 * the shared LiveBus so connected home-page terminals see live output.
 */

import { getMacro, createHistory, updateHistory } from "@/lib/db/queries";
import { liveBus } from "@/lib/live-bus";
import { agentRegistry } from "@/lib/agents/registry";
import type { MacroCommand } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Encode text as UTF-8 bytes for streaming. */
function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

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

  // 3. Resolve agent hostname
  const resolvedAgent =
    agentHostname || (macro.runOnAgent ? macro.agentHostname : "");

  // 4. Parse commands
  let commands: MacroCommand[] = [];
  try {
    commands = JSON.parse(macro.commands || "[]");
  } catch {
    commands = [];
  }

  // 5. Build output buffer (concatenated for history storage)
  const chunks: string[] = [];

  function write(msg: string) {
    const chunk = msg.endsWith("\n") ? msg : msg + "\n";
    liveBus.publish({
      type: "output",
      text: chunk,
      macroId,
      timestamp: Date.now(),
    });
    chunks.push(chunk);
  }

  // 6. Header
  write(`=== Running Macro: ${macro.name} ===`);
  if (macro.description) {
    write(`Description: ${macro.description}`);
  }
  write(`Triggered By: ${triggeredBy}`);
  if (resolvedAgent) {
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

  // 8. Execute commands locally
  let finalized = false;
  try {
    for (const mc of commands) {
      write(`> ${mc.cmd}`);

      const proc = Bun.spawn(["bash", "-c", mc.cmd], {
        cwd: mc.working_dir || process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      // Stream stdout — capture promise so we can await after exit
      const stdoutReader = proc.stdout.getReader();
      const stdoutPromise = (async () => {
        while (true) {
          const { done, value } = await stdoutReader.read();
          if (done) break;
          if (value) {
            const text = decodeChunk(value);
            liveBus.publish({
              type: "output",
              text,
              macroId,
              timestamp: Date.now(),
            });
            chunks.push(text);
          }
        }
      })();

      // Stream stderr — capture promise so we can await after exit
      const stderrReader = proc.stderr.getReader();
      const stderrPromise = (async () => {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          if (value) {
            const text = decodeChunk(value);
            liveBus.publish({
              type: "output",
              text,
              macroId,
              timestamp: Date.now(),
            });
            chunks.push(text);
          }
        }
      })();

      // Wait for process to finish, then ensure readers are done
      const exitCode = await proc.exited;
      await stdoutPromise;
      await stderrPromise;

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
}
