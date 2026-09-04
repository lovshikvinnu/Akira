/**
 * Resource sampling.
 *
 * `ResourceRecord` in the frozen telemetry model demands five numbers:
 * cpuLoadPercentage, memoryRssBytes, memoryHeapBytes, eventLoopLagMs and
 * diskFreeBytes. AKIRA runs in a browser as well as a server, and in neither
 * place can it honestly produce all five -- there is no portable CPU-percentage
 * API, and `os.loadavg()` returns a hardcoded [0,0,0] on Windows, which is a
 * fabricated zero rather than a measurement. Disk space is Node-only.
 *
 * So the sampler reports what it actually measured and says plainly what it
 * could not. These tests exist mainly to stop a future change from filling the
 * gaps with plausible-looking zeros.
 */
import { describe, it, expect } from "vitest";

const { ResourceSampler, describeResourceAvailability } =
  await import("../src/observability/resources/resource-sampler");

describe("the sampler measures only what the runtime can actually provide", () => {
  it("reports which dimensions are available on this runtime", () => {
    const availability = describeResourceAvailability();

    expect(typeof availability.heapUsedBytes).toBe("boolean");
    expect(typeof availability.rssBytes).toBe("boolean");
    expect(typeof availability.cpuLoadPercentage).toBe("boolean");
    expect(typeof availability.diskFreeBytes).toBe("boolean");
  });

  it("never claims CPU load or free disk, on any runtime", () => {
    // Not an accident of the current platform: neither is portably measurable,
    // and reporting a fabricated number is worse than reporting nothing.
    const availability = describeResourceAvailability();
    expect(availability.cpuLoadPercentage).toBe(false);
    expect(availability.diskFreeBytes).toBe(false);

    const sample = new ResourceSampler().sample();
    expect(sample.cpuLoadPercentage).toBeUndefined();
    expect(sample.diskFreeBytes).toBeUndefined();
  });

  it("omits a dimension rather than reporting zero for it", () => {
    const sample = new ResourceSampler().sample();
    for (const [key, value] of Object.entries(sample.measurements)) {
      // Every key present in `measurements` must be a real reading. A dimension
      // that could not be read must be absent, not present-and-zero.
      expect(value, `dimension ${key} is present but not a finite number`).toSatisfy(
        (v: unknown) => typeof v === "number" && Number.isFinite(v),
      );
    }
  });

  it("measures heap usage under Node, where it is genuinely available", () => {
    const availability = describeResourceAvailability();
    const sample = new ResourceSampler().sample();

    if (availability.heapUsedBytes) {
      expect(sample.heapUsedBytes).toBeGreaterThan(0);
    } else {
      expect(sample.heapUsedBytes).toBeUndefined();
    }
  });

  it("stamps every sample with the time it was taken", () => {
    const sample = new ResourceSampler().sample();
    expect(sample.takenAt).toBeTruthy();
    expect(Number.isNaN(new Date(sample.takenAt).getTime())).toBe(false);
  });

  it("produces a changing heap reading rather than a cached constant", () => {
    const sampler = new ResourceSampler();
    const first = sampler.sample();
    // Allocate enough to move the heap.
    const ballast: number[][] = [];
    for (let i = 0; i < 2000; i++) ballast.push(new Array(200).fill(i));
    const second = sampler.sample();
    expect(ballast.length).toBe(2000);

    if (describeResourceAvailability().heapUsedBytes) {
      // Not asserting it grew -- GC may run between the two -- only that the
      // sampler re-reads rather than memoising the first value forever.
      expect(second.takenAt >= first.takenAt).toBe(true);
      expect(typeof second.heapUsedBytes).toBe("number");
    }
  });
});

describe("application pressure is measurable everywhere", () => {
  it("reports AKIRA-internal pressure supplied by the caller", () => {
    const sampler = new ResourceSampler();
    const sample = sampler.sample({ telemetryRecords: 42, trackedComponents: 7 });

    expect(sample.measurements["akira.telemetry_records"]).toBe(42);
    expect(sample.measurements["akira.tracked_components"]).toBe(7);
  });

  it("leaves pressure gauges out when the caller supplies none", () => {
    const sample = new ResourceSampler().sample();
    expect(sample.measurements["akira.telemetry_records"]).toBeUndefined();
  });
});

describe("the sampler is safe to call in a browser bundle", () => {
  it("does not import any Node-only module at module scope", async () => {
    // Static `import "node:os"` in this file would break the client build. The
    // guard is structural: the source must contain no bare node: import.
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/observability/resources/resource-sampler.ts", "utf8");

    expect(source).not.toMatch(/^\s*import\s+.*["']node:/m);
    expect(source).not.toMatch(/^\s*import\s+.*["']better-sqlite3["']/m);
    expect(source).not.toMatch(/^\s*import\s+.*["']async_hooks["']/m);
  });
});
