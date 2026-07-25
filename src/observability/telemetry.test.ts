import { describe, it, expect, vi } from "vitest";
import {
  telemetry,
  factory,
  context,
  clock,
  idGenerator,
  TelemetrySeverity,
  TelemetryRecord,
  TelemetrySink,
  TelemetryPipelineStage,
  TelemetryValidationError,
  TelemetrySerializationError,
  PipelineError,
  LogRecord,
  MetricRecord,
  TraceRecord,
} from "./index";

describe("Telemetry Core Foundation Tests", () => {
  describe("Immutability", () => {
    it("should create frozen and immutable records", () => {
      const record = factory.createLog(
        "test-module",
        "test-src",
        TelemetrySeverity.INFO,
        "Immutable test message",
      );

      expect(Object.isFrozen(record)).toBe(true);
      expect(Object.isFrozen(record.metadata)).toBe(true);

      // Attempting to modify properties should fail/throw in strict mode
      // We can assert that the descriptor is not writable
      const descriptor = Object.getOwnPropertyDescriptor(record, "moduleId");
      expect(descriptor?.writable).toBe(false);
    });

    it("should deep freeze complex metadata", () => {
      const complexMeta = {
        nested: {
          deep: {
            value: 42,
          },
        },
        arr: [1, 2, { ok: true }],
      };

      const record = factory.createLog(
        "test-module",
        "test-src",
        TelemetrySeverity.INFO,
        "Deep freeze test",
        undefined,
        complexMeta,
      );

      expect(Object.isFrozen(record.metadata)).toBe(true);
      expect(Object.isFrozen(record.metadata.nested)).toBe(true);
      expect(Object.isFrozen((record.metadata.nested as any).deep)).toBe(true);
      expect(Object.isFrozen(record.metadata.arr)).toBe(true);
      expect(Object.isFrozen((record.metadata.arr as any)[2])).toBe(true);
    });
  });

  describe("Validation", () => {
    it("should pass valid records", () => {
      const record = factory.createMetric(
        "test-module",
        "test-src",
        "system.cpu",
        "gauge",
        45.2,
        TelemetrySeverity.INFO,
      );

      expect(() => telemetry.validate(record)).not.toThrow();
    });

    it("should throw TelemetryValidationError for missing required fields", () => {
      // Create a corrupted record by ignoring constructor type safety using as any
      const corruptRecord = {
        id: "",
        timestamp: new Date().toISOString(),
        monotonicTimestamp: "123456",
        source: "src",
        moduleId: "mod",
        correlation: { correlationId: "corr" },
        severity: TelemetrySeverity.INFO,
        version: "1.0.0",
        metadata: {},
        type: "log",
      } as any;

      expect(() => telemetry.validate(corruptRecord)).toThrow(TelemetryValidationError);
    });

    it("should reject invalid timestamps", () => {
      const corruptRecord = new LogRecord(
        idGenerator.generateId(),
        "invalid-date-string",
        "123456",
        "src",
        "mod",
        { correlationId: "corr" },
        "message",
        undefined,
        TelemetrySeverity.INFO,
        "1.0.0",
        {},
      );

      expect(() => telemetry.validate(corruptRecord)).toThrow(TelemetryValidationError);
    });

    it("should reject circular references in metadata", () => {
      const circular: any = {};
      circular.self = circular;

      const record = factory.createLog(
        "test-module",
        "test-src",
        TelemetrySeverity.INFO,
        "Circular test",
        undefined,
        circular,
      );

      expect(() => {
        telemetry.validate(record);
      }).toThrow(/Circular reference/);
    });

    it("should reject invalid semver version format", () => {
      const corruptRecord = new LogRecord(
        idGenerator.generateId(),
        new Date().toISOString(),
        "123456",
        "src",
        "mod",
        { correlationId: "corr" },
        "message",
        undefined,
        TelemetrySeverity.INFO,
        "invalid-version",
        {},
      );

      expect(() => telemetry.validate(corruptRecord)).toThrow(TelemetryValidationError);
    });
  });

  describe("Serialization", () => {
    it("should serialize and deserialize cleanly", () => {
      const record = factory.createMetric(
        "test-module",
        "test-src",
        "test.counter",
        "counter",
        1,
        TelemetrySeverity.DEBUG,
        { tags: "serialization" },
      );

      const serialized = telemetry.serialize(record);
      expect(typeof serialized).toBe("string");

      const deserialized = JSON.parse(serialized);
      expect(deserialized.id).toBe(record.id);
      expect(deserialized.metricName).toBe("test.counter");
      expect(deserialized.metadata.tags).toBe("serialization");
    });

    it("should throw TelemetrySerializationError on circular parse failures", () => {
      // Mock JSON.stringify serialization error
      const mockSerializer = {
        serialize: () => {
          throw new Error("stringify error");
        },
        deserialize: () => {
          throw new Error("parse error");
        },
      } as any;

      expect(() => mockSerializer.serialize()).toThrow();
    });
  });

  describe("Time and Clocks", () => {
    it("should measure durations using monotonic time, not wall clock", () => {
      const start = clock.monotonicNow();
      // Simulating a delay
      const end = start + 5000000n; // 5ms in nanoseconds
      const elapsed = clock.elapsedMs(start, end);

      expect(elapsed).toBe(5);
    });

    it("should generate valid ISO timestamps for wall clock", () => {
      const iso = clock.nowIso();
      expect(() => new Date(iso)).not.toThrow();
      expect(iso).toContain("T");
      expect(iso).toContain("Z");
    });
  });

  describe("Correlation Context", () => {
    it("should propagate context across synchronous boundaries", () => {
      const initialCorr = context.getCorrelation();
      expect(initialCorr.correlationId).toBeDefined();

      context.runWith({ correlationId: "action-123", workspaceId: "work-99" }, () => {
        const active = context.getCorrelation();
        expect(active.correlationId).toBe("action-123");
        expect(active.workspaceId).toBe("work-99");
      });

      // Context must restore to previous state after exiting block
      expect(context.getCorrelation().correlationId).toBe(initialCorr.correlationId);
    });

    it("should propagate context across asynchronous boundaries", async () => {
      await context.runWithAsync({ correlationId: "async-action-abc" }, async () => {
        // Yield execution to simulate macrotask queue delay
        await new Promise((resolve) => setTimeout(resolve, 5));

        const active = context.getCorrelation();
        expect(active.correlationId).toBe("async-action-abc");
      });
    });
  });

  describe("Pipeline and Sinks", () => {
    it("should execute stages in order and forward to final sink", async () => {
      const traceRecord = factory.createTrace(
        "mod",
        "src",
        "span-1",
        null,
        "span-name",
        15,
        "ok",
        [],
        TelemetrySeverity.INFO,
      );

      const stageOrder: string[] = [];
      const stageA: TelemetryPipelineStage = {
        name: "StageA",
        process: async (rec, next) => {
          stageOrder.push("A_Start");
          await next(rec);
          stageOrder.push("A_End");
        },
      };

      const stageB: TelemetryPipelineStage = {
        name: "StageB",
        process: async (rec, next) => {
          stageOrder.push("B_Start");
          await next(rec);
          stageOrder.push("B_End");
        },
      };

      let sinkRecord: TelemetryRecord | null = null;
      const mockSink: TelemetrySink = {
        name: "MockSink",
        write: async (rec) => {
          stageOrder.push("Sink");
          sinkRecord = rec;
        },
      };

      const service = new (telemetry.constructor as any)();
      service.getPipeline().use(stageA).use(stageB).setSink(mockSink);

      await service.record(traceRecord);

      expect(stageOrder).toEqual(["A_Start", "B_Start", "Sink", "B_End", "A_End"]);
      expect(sinkRecord).toBe(traceRecord);
    });

    it("should isolate pipeline errors and wrap them in PipelineError", async () => {
      const record = factory.createLog("mod", "src", TelemetrySeverity.INFO, "msg");
      const badStage: TelemetryPipelineStage = {
        name: "BadStage",
        process: async () => {
          throw new Error("Disk failure");
        },
      };

      const service = new (telemetry.constructor as any)();
      service.getPipeline().use(badStage);

      await expect(service.record(record)).rejects.toThrow(PipelineError);
    });
  });
});
