import { describe, it, expect } from "vitest";
import { SimpleMetricRegistry } from "./registry";
import { MetricRegistrationError, MetricValidationError } from "./errors";
import { telemetry, factory, TelemetrySeverity, TelemetrySink, TelemetryRecord } from "../index";
import { MetricAggregator, MetricDataPoint } from "./aggregation";
import { MetricRecord } from "../models/record";
import { CounterImpl } from "./types";

describe("Metrics Subsystem Specification Tests", () => {
  describe("Counter Behavior & Metadata", () => {
    it("should initialize with full metadata, increment, and reset correctly", () => {
      const registry = new SimpleMetricRegistry();
      const counter = registry.counter(
        "system.request_count",
        "1",
        { env: "prod" },
        {
          description: "Tracks total incoming requests",
          category: "network",
          module: "http-server",
          version: "2.1.0",
        },
      );

      expect(counter.getValue()).toBe(0);
      expect(counter.metadata.name).toBe("system.request_count");
      expect(counter.metadata.description).toBe("Tracks total incoming requests");
      expect(counter.metadata.category).toBe("network");
      expect(counter.metadata.module).toBe("http-server");
      expect(counter.metadata.version).toBe("2.1.0");
      expect(counter.metadata.creationTime).toBeDefined();

      counter.increment();
      expect(counter.getValue()).toBe(1);

      counter.increment(9);
      expect(counter.getValue()).toBe(10);

      counter.reset();
      expect(counter.getValue()).toBe(0);
    });

    it("should reject negative increment values", () => {
      const registry = new SimpleMetricRegistry();
      const counter = registry.counter("system.request_count", "1");
      expect(() => counter.increment(-5)).toThrow(MetricValidationError);
    });
  });

  describe("Gauge Behavior", () => {
    it("should support set, increase, and decrease operations", () => {
      const registry = new SimpleMetricRegistry();
      const gauge = registry.gauge("system.cpu_load", "percent");

      expect(gauge.getValue()).toBe(0);

      gauge.set(45.5);
      expect(gauge.getValue()).toBe(45.5);

      gauge.increase(10);
      expect(gauge.getValue()).toBe(55.5);

      gauge.decrease(5.5);
      expect(gauge.getValue()).toBe(50);
    });
  });

  describe("Timer & Monotonic Accuracy", () => {
    it("should profile execution using Monotonic Clock and record statistics", async () => {
      const registry = new SimpleMetricRegistry();
      const timer = registry.timer("workspace.load_time", "ms");

      const span = timer.start();
      await new Promise((resolve) => setTimeout(resolve, 15));
      const duration = span.stop();

      expect(duration).toBeGreaterThanOrEqual(10);
      expect(timer.getMin()).toBe(duration);
      expect(timer.getMax()).toBe(duration);
      expect(timer.getAverage()).toBe(duration);

      timer.record(45);
      expect(timer.getMin()).toBeLessThanOrEqual(45);
    });
  });

  describe("Histogram & Exact Percentiles", () => {
    it("should record distributions and calculate exact percentiles", () => {
      const registry = new SimpleMetricRegistry();
      const histogram = registry.histogram("query.results", "count");

      histogram.record(10);
      histogram.record(20);
      histogram.record(30);
      histogram.record(40);
      histogram.record(50);

      const data = histogram.getHistogramData();
      expect(data.count).toBe(5);
      expect(data.sum).toBe(150);
      expect(data.min).toBe(10);
      expect(data.max).toBe(50);
      expect(data.average).toBe(30);

      // Exact percentiles verification (P50 = 30, P90 = 50, etc.)
      expect(histogram.getPercentile(50)).toBe(30);
      expect(histogram.getPercentile(90)).toBe(50);
      expect(histogram.getPercentile(99)).toBe(50);
    });
  });

  describe("Metric Registry & Iteration APIs", () => {
    it("should support register, unregister, find, list, and exists", () => {
      const registry = new SimpleMetricRegistry();

      const labels = { database: "sqlite" };
      const counter = new CounterImpl("db.query", "counter", "1", labels);

      expect(registry.exists("db.query", labels)).toBe(false);
      registry.register(counter);
      expect(registry.exists("db.query", labels)).toBe(true);

      const found = registry.find("db.query", labels);
      expect(found).toBe(counter);

      const list = registry.list();
      expect(list.length).toBe(1);
      expect(list[0]).toBe(counter);

      registry.unregister("db.query", labels);
      expect(registry.exists("db.query", labels)).toBe(false);
    });

    it("should detect duplicate name type mismatch conflicts", () => {
      const registry = new SimpleMetricRegistry();
      registry.counter("test.metric", "1");

      expect(() => registry.gauge("test.metric", "1")).toThrow(MetricRegistrationError);
    });
  });

  describe("Aggregation Subsystem", () => {
    it("should compute aggregates independent of metric storage", () => {
      const points: MetricDataPoint[] = [
        { value: 10, timestamp: "2026-07-25T12:00:00.000Z" },
        { value: 20, timestamp: "2026-07-25T12:00:01.000Z" },
        { value: 30, timestamp: "2026-07-25T12:00:02.000Z" },
      ];

      expect(MetricAggregator.count(points)).toBe(3);
      expect(MetricAggregator.sum(points)).toBe(60);
      expect(MetricAggregator.average(points)).toBe(20);
      expect(MetricAggregator.minimum(points)).toBe(10);
      expect(MetricAggregator.maximum(points)).toBe(30);
      expect(MetricAggregator.latest(points)).toBe(30);

      // Rate: (30 - 10) / 2 seconds = 10 units/sec
      expect(MetricAggregator.rate(points)).toBe(10);

      // Moving Average (window = 2):
      // Index 0: avg([10]) = 10
      // Index 1: avg([10, 20]) = 15
      // Index 2: avg([20, 30]) = 25
      const ma = MetricAggregator.movingAverage(points, 2);
      expect(ma).toEqual([10, 15, 25]);
    });
  });

  describe("Concurrency Safety & Performance", () => {
    it("should profile execution timing and safely update metrics in parallel", async () => {
      const registry = new SimpleMetricRegistry();
      const counter = registry.counter("concurrent.counter", "1");
      const gauge = registry.gauge("concurrent.gauge", "1");

      const promises: Promise<void>[] = [];
      for (let i = 0; i < 500; i++) {
        promises.push(
          (async () => {
            counter.increment(2);
            gauge.set(i);
          })(),
        );
      }

      await Promise.all(promises);

      expect(counter.getValue()).toBe(1000);
      expect(gauge.getValue()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Pipeline & Failure Isolation Integration", () => {
    it("should handle error isolation and pipeline integration", async () => {
      const registry = new SimpleMetricRegistry();
      const counter = registry.counter("isolated.counter", "1");

      // Verify failure isolation: recording invalid input raises error but leaves metric stable
      expect(() => counter.increment(-10)).toThrow(MetricValidationError);
      expect(counter.getValue()).toBe(0);

      // Verify integration with pipeline
      const snap = counter.getSnapshot();
      const record = factory.createMetric(
        "metrics-runner",
        "metrics.registry",
        snap.metadata.name,
        "counter",
        snap.value as number,
        TelemetrySeverity.INFO,
        { ...snap.metadata.labels, unit: snap.metadata.unit },
      );

      // Captured through a holder object: a `let` assigned only inside the sink
      // closure gets narrowed to null by control-flow analysis at the read site.
      const sinkCapture: { record: TelemetryRecord | null } = { record: null };
      const pipelineSink: TelemetrySink = {
        name: "TestSink",
        write: async (rec) => {
          sinkCapture.record = rec;
        },
      };

      const testTelemetry = new (telemetry.constructor as any)();
      testTelemetry.getPipeline().setSink(pipelineSink);

      await testTelemetry.record(record);

      expect(sinkCapture.record).not.toBeNull();
      expect((sinkCapture.record as MetricRecord).metricName).toBe("isolated.counter");
    });
  });
});
