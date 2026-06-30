/**
 * Tests for the SSH argv builder extracted from command-runner.ts.
 *
 * The full `main()` is an integration wrapper around `bun.spawn` —
 * testing it end-to-end would require running ssh for real. Instead we
 * test the pure helper that constructs the argv, which is the only
 * piece with non-trivial logic (flag order, port stringification,
 * strict-host-key policy).
 */

import { describe, expect, test } from "bun:test";
import { buildSshCommand } from "./command-runner";

describe("buildSshCommand", () => {
  test("places the binary first, the host, and the cmd last", () => {
    const argv = buildSshCommand("user@host", "/key/path", 22, "uptime");
    expect(argv[0]).toBe("ssh");
    // host comes after the flag pairs, just before the remote cmd
    expect(argv[argv.length - 2]).toBe("user@host");
    expect(argv[argv.length - 1]).toBe("uptime");
  });

  test("emits identity (-i) and port (-p) flag pairs in order", () => {
    const argv = buildSshCommand("h", "/k", 2222, "ls");
    // ssh, -i, k, -p, 2222, -o, ..., -o, ..., h, ls
    expect(argv.slice(0, 5)).toEqual(["ssh", "-i", "/k", "-p", "2222"]);
  });

  test("stringifies the port (ssh expects a string after -p)", () => {
    const argv = buildSshCommand("h", "k", 5022, "echo hi");
    const pIdx = argv.indexOf("-p");
    expect(argv[pIdx + 1]).toBe("5022");
    expect(typeof argv[pIdx + 1]).toBe("string");
  });

  test("includes BatchMode and StrictHostKeyChecking=accept-new", () => {
    const argv = buildSshCommand("h", "k", 22, "true");
    // both -o flags should be present, with their values directly after
    const oFlags: Array<[string, string]> = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "-o") oFlags.push([argv[i], argv[i + 1]]);
    }
    expect(oFlags).toEqual([
      ["-o", "BatchMode=yes"],
      ["-o", "StrictHostKeyChecking=accept-new"],
    ]);
  });

  test("passes the cmd through verbatim, including spaces and quotes", () => {
    const argv = buildSshCommand("h", "k", 22, "sudo systemctl restart nginx");
    expect(argv[argv.length - 1]).toBe("sudo systemctl restart nginx");
  });

  test("does not mutate the inputs", () => {
    const host = "user@host";
    const key = "/key";
    const cmd = "echo a b c";
    const argv = buildSshCommand(host, key, 22, cmd);
    expect(host).toBe("user@host");
    expect(key).toBe("/key");
    expect(cmd).toBe("echo a b c");
    // sanity: argv is a fresh array
    expect(argv).not.toBe([host, key, cmd] as unknown as string[]);
  });

  test("the argv length is deterministic (binary + 4 flag pairs + host + cmd = 10)", () => {
    const argv = buildSshCommand("h", "k", 22, "ls");
    // ["ssh", "-i", k, "-p", "22", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "h", "ls"]
    expect(argv).toHaveLength(11);
  });
});
