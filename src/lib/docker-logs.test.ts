import { describe, expect, test } from "bun:test";
import {
  BACKFILL_STEPS,
  DOZZLE_LOG_LEVELS,
  buildDozzleEndpointUrl,
  buildLogQuery,
  buildProxyLogUrl,
  decodeLogMessage,
  normalizeDozzleUrl,
} from "./docker-logs";

describe("docker logs helpers", () => {
  test("normalizes a Dozzle URL without changing its protocol or path", () => {
    expect(normalizeDozzleUrl(" http://192.168.1.111:8080/// ")).toBe("http://192.168.1.111:8080");
    expect(() => normalizeDozzleUrl("ftp://example.com")).toThrow("http");
  });

  test("builds upstream URLs relative to a configured Dozzle base", () => {
    expect(buildDozzleEndpointUrl("http://dozzle.local/base/", "/api/events/stream")).toBe(
      "http://dozzle.local/base/api/events/stream",
    );
  });

  test("builds a safe repeated-level log query", () => {
    const query = buildLogQuery({
      host: "host/with spaces",
      min: 300,
      includeStdout: true,
      includeStderr: true,
    });

    expect(query.get("host")).toBe("host/with spaces");
    expect(query.get("min")).toBe("300");
    expect(query.has("stdout")).toBe(true);
    expect(query.has("stderr")).toBe(true);
    expect(query.getAll("levels")).toEqual([...DOZZLE_LOG_LEVELS]);
    expect(query.get("unexpected")).toBeNull();
  });

  test("builds the MC log proxy URL with encoded identifiers", () => {
    expect(buildProxyLogUrl(7, "container/id", "host id", "stream")).toBe(
      "/api/docker-logs/endpoints/7/containers/container%2Fid/logs/stream?host=host+id&stdout=&stderr=&levels=trace&levels=debug&levels=info&levels=warn&levels=error&levels=fatal&levels=unknown",
    );
  });

  test("decodes simple, grouped, complex, and raw log messages", () => {
    expect(decodeLogMessage({ m: "hello", rm: "hello" })).toBe("hello");
    expect(decodeLogMessage({ t: "group", m: [{ m: "one" }, { m: "two" }] })).toBe("one\ntwo");
    expect(decodeLogMessage({ t: "complex", m: { level: "info", message: "hello" } })).toBe(
      '{"level":"info","message":"hello"}',
    );
    expect(decodeLogMessage({ rm: "raw" })).toBe("raw");
  });

  test("uses Dozzle's canonical levels and deliberately small backfill ladder", () => {
    expect(DOZZLE_LOG_LEVELS).toEqual(["trace", "debug", "info", "warn", "error", "fatal", "unknown"]);
    expect(BACKFILL_STEPS).toEqual([100, 300, 1000]);
  });
});
