# AKIRA OS Telemetry Core Specification

This document provides a comprehensive developer and architect guide for the Telemetry Core module within the AKIRA OS Observability Platform.

---

## 1. Core Architecture Overview

The Telemetry Core provides the fundamental types, models, facades, context managers, pipelines, and validation engines that underpin all higher-level telemetry reporting subsystems (Logging, Tracing, Metrics, Diagnostics, Health monitoring, Audit tracking, and Resource profiling).

```text
       [ Subsystems: Core & Domain ] (e.g. Workspace, Tasks, GENESIS)
                    │
                    ▼  (Write-only record creation via Factory)
         [ api/TelemetryService ]
                    │
                    ▼  (Validation checking)
         [ api/TelemetryValidator ]
                    │
                    ▼  (Context enrichment / trace headers mapping)
         [ api/TelemetryContext ] (AsyncLocalStorage)
                    │
                    ▼  (Serialization / stringification)
        [ api/TelemetrySerializer ] (JSON)
                    │
                    ▼  (Sequential Middleware processing)
         [ api/TelemetryPipeline ]
          ├── Stage 1: Filtering / Sampling
          ├── Stage 2: Masking / PII Scrubbing
          └── Stage 3: Batching
                    │
                    ▼
         [ api/TelemetrySink ] (Exporters: Console / File / SQLite / OTLP)
```

---

## 2. Records Lifecycle & Data Flow

Every recorded telemetry fact passes through a deterministic pipeline lifecycle:
1. **Creation**: The subsystem uses `telemetryFactory` to build a concrete record instance (e.g. `MetricRecord`, `LogRecord`).
2. **Context Enrichment**: The factory fetches the current thread execution context from `telemetryContext` (Trace ID, Session ID, etc.) and injects it into the record correlation block.
3. **Immutability Enforcement**: The factory executes `Object.freeze()` or `deepFreeze()` on the record to prevent subsequent runtime modifications.
4. **Validation**: `telemetryService` runs the validator to assert schema, semver, and JSON-compliance constraints.
5. **Pipeline Propagation**: The record flows sequentially through registered pipeline stages (sampling, redaction) and arrives at the terminal sink.

---

## 3. Correlation Model

Trace contexts propagate automatically across asynchronous execution scopes. The correlation model carries the following identifiers:

```typescript
export interface TelemetryCorrelation {
  readonly correlationId: string; // Unique action flow ID
  readonly traceId?: string;       // Unique ID linking parent/child spans
  readonly spanId?: string;        // Specific operation segment ID
  readonly parentSpanId?: string;  // Parent trace span reference
  readonly workspaceId?: string;  // Active workspace directory ID
  readonly sessionId?: string;    // Active user session ID
  readonly capabilityId?: string; // Origin capability identifier
  readonly eventId?: string;       // Triggering bus event ID
}
```

Context propagation is powered by Node.js `AsyncLocalStorage` inside `AsyncTelemetryContext`. In browser environments, it falls back gracefully to a synchronous single-store block.

---

## 4. Time Model

* **Wall Clock Time**: Captured using standard JavaScript UTC date calculations (`Date.prototype.toISOString()`). This timestamp is used for human presentation, persistence files, and dashboard timelines.
* **Monotonic Time**: Captured in nanoseconds using high-resolution timers (`process.hrtime.bigint()` or `performance.now()`). All duration calculations (e.g., span execution times) must be computed by subtracting monotonic timestamps:
  ```typescript
  const start = clock.monotonicNow();
  // ... execute task
  const durationMs = clock.elapsedMs(start, clock.monotonicNow());
  ```
  *Wall clock timestamps must never be used to calculate operational durations.*

---

## 5. Metadata Validation Rules

Telemetry records accept a nested metadata dictionary. To ensure the database can serialize the record and that memory runs leak-free:
1. Primitives must only be `string`, `number`, `boolean`, or `null`.
2. Array structures and dictionary objects are allowed.
3. **Circular Reference Detection**: The validator traverses nested metadata structures and throws a `TelemetryValidationError` if a cyclic path is detected.

---

## 6. Serialization Layer

Telemetry records are serialized to structured strings before write or transport execution.
* The default implementation is `JsonTelemetrySerializer`.
* The serialization layer is decoupled from JSON; alternative serializers (e.g., MessagePack, OTLP Binary Protocol Buffers) can be registered without altering call signatures.

---

## 7. Thread Safety & Concurrency

JavaScript is single-threaded; however, asynchronous execution introduces concurrency race hazards. The Telemetry Core ensures thread safety via:
* **Object Freezing**: Telemetry records are deeply frozen immediately upon instantiation.
* **Copy-on-Write Contexts**: Correlation maps merged onto active execution contexts generate new objects, protecting parent boundaries.
* **Lock-Free Queueing**: High-frequency metrics ingestion pushes records onto memory-backed queues synchronously without waiting for disk locks.

---

## 8. Extension Points

### 8.1. Writing a Pipeline Stage
Custom processors (e.g., custom scrubbers or aggregators) implement `TelemetryPipelineStage`:
```typescript
import { TelemetryPipelineStage, TelemetryRecord } from "@observability";

export class EncryptionScrubberStage implements TelemetryPipelineStage {
  public readonly name = "EncryptionScrubber";

  public async process(record: TelemetryRecord, next: (rec: TelemetryRecord) => Promise<void>): Promise<void> {
    if (record.metadata && record.metadata.password) {
      // Create a shallow copy with modified metadata (original is frozen)
      const scrubbedRecord = {
        ...record,
        metadata: { ...record.metadata, password: "[REDACTED]" }
      };
      await next(scrubbedRecord);
    } else {
      await next(record);
    }
  }
}
```

### 8.2. Custom Telemetry Exporters (Sinks)
Exporters implement `TelemetrySink` and connect to the pipeline termination:
```typescript
import { TelemetrySink, TelemetryRecord } from "@observability";

export class FileAppendSink implements TelemetrySink {
  public readonly name = "FileAppendSink";

  public async write(record: TelemetryRecord): Promise<void> {
    // Write record to a local append-only log file
  }
}
```

---

## 9. Usage Examples

### 9.1. Basic Metrics Recording
```typescript
import { telemetry, factory, TelemetrySeverity } from "src/observability";

const metric = factory.createMetric(
  "workspace",
  "WorkspaceService.load",
  "workspace.cache.hits",
  "counter",
  1,
  TelemetrySeverity.INFO
);

await telemetry.record(metric);
```

### 9.2. Executing Within a Custom Correlation Context
```typescript
import { context, telemetry, factory, TelemetrySeverity } from "src/observability";

await context.runWithAsync({ sessionId: "user-session-99", correlationId: "action-456" }, async () => {
  // All logging inside this block inherits sessionId and correlationId automatically
  const log = factory.createLog(
    "auth",
    "AuthService.login",
    TelemetrySeverity.INFO,
    "User authentication attempt succeeded"
  );
  
  await telemetry.record(log);
});
```
