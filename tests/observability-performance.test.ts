/**
 * Performance measurement.
 *
 * The failure mode this guards against is instrumenting everything and learning
 * nothing: thousands of timers whose numbers nobody can act on. The monitor is
 * deliberately small -- it measures named operations, keeps a bounded window of
 * samples, and computes the few statistics that actually drive a decision
 * (count, mean, max, p95).
 *
 * The measurements must be real. A monitor that records a hardcoded duration,
 * or that reports success for an operation that threw, is worse than none, so
 * these tests pin both.
 */
import { describe, it, expect, beforeEach } from "vitest";

const { PerformanceMonitor } = await import("../src/observability/performance/performance-monitor");

describe("performance measurements reflect real work", () => {
  let perf: InstanceType<typeof PerformanceMonitor>;
  beforeEach(() => {
    perf = new PerformanceMonitor();
  });

  it("measures the actual elapsed time of an operation, not a constant", () => {
    // A busy wait, so the duration is genuinely non-zero regardless of timer
    // resolution or how the runtime schedules us.
    const done = perf.begin("slow-op");
    const spinUntil = Date.now() + 20;
    while (Date.now() < spinUntil) {
      /* deliberately blocking */
    }
    done();

    const stats = perf.get("slow-op")!;
    expect(stats.count).toBe(1);
    expect(stats.max).toBeGreaterThanOrEqual(15);
  });

  it("distinguishes a fast operation from a slow one", () => {
    const fast = perf.begin("fast");
    fast();

    const slow = perf.begin("slow");
    const spinUntil = Date.now() + 20;
    while (Date.now() < spinUntil) {
      /* deliberately blocking */
    }
    slow();

    expect(perf.get("slow")!.mean).toBeGreaterThan(perf.get("fast")!.mean);
  });

  it("records a directly supplied duration", () => {
    perf.record("db.query", 12);
    perf.record("db.query", 8);

    const stats = perf.get("db.query")!;
    expect(stats.count).toBe(2);
    expect(stats.mean).toBe(10);
    expect(stats.min).toBe(8);
    expect(stats.max).toBe(12);
  });

  it("keeps operations separate", () => {
    perf.record("a", 100);
    perf.record("b", 1);
    expect(perf.get("a")!.mean).toBe(100);
    expect(perf.get("b")!.mean).toBe(1);
  });

  it("knows nothing about an operation never measured", () => {
    expect(perf.get("never-run")).toBeUndefined();
  });
});

describe("failed operations are counted, not silently averaged in", () => {
  let perf: InstanceType<typeof PerformanceMonitor>;
  beforeEach(() => {
    perf = new PerformanceMonitor();
  });

  it("tracks failures separately from successes", () => {
    perf.record("op", 5);
    perf.record("op", 5, { failed: true });
    perf.record("op", 5, { failed: true });

    const stats = perf.get("op")!;
    expect(stats.count).toBe(3);
    expect(stats.failures).toBe(2);
    expect(stats.errorRate).toBeCloseTo(2 / 3, 5);
  });

  it("reports a zero error rate when nothing failed", () => {
    perf.record("clean", 1);
    expect(perf.get("clean")!.errorRate).toBe(0);
    expect(perf.get("clean")!.failures).toBe(0);
  });

  it("marks the operation failed when the measured block throws", () => {
    expect(() =>
      perf.measure("throwing-op", () => {
        throw new Error("kaboom");
      }),
    ).toThrow("kaboom");

    const stats = perf.get("throwing-op")!;
    // The point: the operation still gets measured, and it is not called a success.
    expect(stats.count).toBe(1);
    expect(stats.failures).toBe(1);
  });

  it("returns the value and counts a success when the block does not throw", () => {
    const result = perf.measure("ok-op", () => 42);
    expect(result).toBe(42);
    expect(perf.get("ok-op")!.failures).toBe(0);
  });
});

describe("statistics are computed correctly", () => {
  it("computes p95 from the sample window", () => {
    const perf = new PerformanceMonitor();
    for (let i = 1; i <= 100; i++) perf.record("p", i);

    const stats = perf.get("p")!;
    expect(stats.count).toBe(100);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(100);
    expect(stats.mean).toBeCloseTo(50.5, 5);
    // 95th percentile of 1..100 sits at 95, allowing for index rounding.
    expect(stats.p95).toBeGreaterThanOrEqual(94);
    expect(stats.p95).toBeLessThanOrEqual(96);
  });

  it("handles a single sample without dividing by zero", () => {
    const perf = new PerformanceMonitor();
    perf.record("one", 7);
    const stats = perf.get("one")!;
    expect(stats.mean).toBe(7);
    expect(stats.p95).toBe(7);
    expect(stats.min).toBe(7);
    expect(stats.max).toBe(7);
  });
});

describe("performance tracking cannot grow without bound", () => {
  it("keeps only the most recent samples per operation", () => {
    const perf = new PerformanceMonitor({ maxSamplesPerOperation: 10 });
    for (let i = 0; i < 1000; i++) perf.record("hot", i);

    const stats = perf.get("hot")!;
    // Every call is still counted...
    expect(stats.count).toBe(1000);
    // ...but only the sample window is retained, so statistics come from the
    // last 10 values (990..999).
    expect(stats.sampleCount).toBe(10);
    expect(stats.min).toBe(990);
    expect(stats.max).toBe(999);
  });

  it("refuses to track new operations past the cap", () => {
    const perf = new PerformanceMonitor({ maxOperations: 2 });
    perf.record("a", 1);
    perf.record("b", 1);
    perf.record("c", 1);

    expect(perf.get("a")).toBeDefined();
    expect(perf.get("b")).toBeDefined();
    // An unbounded operation-name space (an id built from user data, say) must
    // not be able to grow this map forever.
    expect(perf.get("c")).toBeUndefined();
    expect(perf.getAll()).toHaveLength(2);
  });

  it("clear() resets everything", () => {
    const perf = new PerformanceMonitor();
    perf.record("a", 1);
    perf.clear();
    expect(perf.getAll()).toHaveLength(0);
    expect(perf.get("a")).toBeUndefined();
  });
});
