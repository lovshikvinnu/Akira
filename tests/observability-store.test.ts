/**
 * The telemetry store.
 *
 * The observability core shipped with a complete instrumentation layer and no
 * collection layer: `TelemetryPipelineImpl` was constructed with zero stages and
 * a null sink, so every record the factory produced was validated and then
 * dropped. Nothing could be read back, which is why nothing in the codebase
 * imported observability at all.
 *
 * The store is that missing layer. It is deliberately a bounded in-memory ring
 * buffer rather than the SQLite table ADR-021 imagined -- see the ADR conflict
 * note in docs/adr/ADR-022. These tests pin the two properties that matter:
 * records are retrievable, and the buffer cannot grow without bound.
 */
import { describe, it, expect, beforeEach } from "vitest";

const { TelemetryStore } = await import("../src/observability/store/telemetry-store");
const { factory } = await import("../src/observability/index");
const { TelemetrySeverity } = await import("../src/observability/models/severity");

function log(message: string, severity = TelemetrySeverity.INFO, moduleId = "mod-a") {
  return factory.createLog(moduleId, "test", severity, message);
}

describe("telemetry store retains and returns records", () => {
  let store: InstanceType<typeof TelemetryStore>;
  beforeEach(() => {
    store = new TelemetryStore({ maxRecords: 100 });
  });

  it("returns a record that was written to it", async () => {
    await store.write(log("hello"));
    const found = store.query();
    expect(found).toHaveLength(1);
    expect((found[0] as any).message).toBe("hello");
  });

  it("preserves write order oldest-first", async () => {
    for (const m of ["a", "b", "c"]) await store.write(log(m));
    expect(store.query().map((r: any) => r.message)).toEqual(["a", "b", "c"]);
  });

  it("filters by record type", async () => {
    await store.write(log("a log"));
    await store.write(
      factory.createMetric("mod-a", "test", "ops", "counter", 1, TelemetrySeverity.INFO),
    );
    expect(store.query({ type: "log" })).toHaveLength(1);
    expect(store.query({ type: "metric" })).toHaveLength(1);
  });

  it("filters by module and by minimum severity", async () => {
    await store.write(log("a", TelemetrySeverity.DEBUG, "mod-a"));
    await store.write(log("b", TelemetrySeverity.ERROR, "mod-a"));
    await store.write(log("c", TelemetrySeverity.ERROR, "mod-b"));

    expect(store.query({ moduleId: "mod-a" })).toHaveLength(2);
    expect(store.query({ minSeverity: TelemetrySeverity.ERROR })).toHaveLength(2);
    expect(store.query({ moduleId: "mod-a", minSeverity: TelemetrySeverity.ERROR })).toHaveLength(
      1,
    );
  });

  it("returns the newest N when a limit is given", async () => {
    for (const m of ["a", "b", "c", "d"]) await store.write(log(m));
    expect(store.query({ limit: 2 }).map((r: any) => r.message)).toEqual(["c", "d"]);
  });
});

describe("the store cannot grow without bound", () => {
  it("evicts the oldest records once full", async () => {
    const store = new TelemetryStore({ maxRecords: 3 });
    for (const m of ["a", "b", "c", "d", "e"]) await store.write(log(m));

    expect(store.count()).toBe(3);
    expect(store.query().map((r: any) => r.message)).toEqual(["c", "d", "e"]);
  });

  it("reports how many records it has dropped", async () => {
    const store = new TelemetryStore({ maxRecords: 2 });
    for (const m of ["a", "b", "c", "d"]) await store.write(log(m));
    expect(store.stats().dropped).toBe(2);
    expect(store.stats().retained).toBe(2);
  });

  it("stays bounded under sustained load far beyond its cap", async () => {
    const store = new TelemetryStore({ maxRecords: 50 });
    for (let i = 0; i < 5000; i++) await store.write(log(`m${i}`));
    expect(store.count()).toBe(50);
    expect(store.query().map((r: any) => r.message)).toEqual(
      Array.from({ length: 50 }, (_, i) => `m${4950 + i}`),
    );
  });
});

describe("the store is a real telemetry sink", () => {
  it("satisfies the TelemetrySink contract so the pipeline can terminate in it", () => {
    const store = new TelemetryStore({ maxRecords: 10 });
    expect(typeof store.name).toBe("string");
    expect(store.name.length).toBeGreaterThan(0);
    expect(typeof store.write).toBe("function");
  });

  it("clear() empties it and resets the counters", async () => {
    const store = new TelemetryStore({ maxRecords: 10 });
    await store.write(log("a"));
    store.clear();
    expect(store.count()).toBe(0);
    expect(store.stats().dropped).toBe(0);
  });
});
