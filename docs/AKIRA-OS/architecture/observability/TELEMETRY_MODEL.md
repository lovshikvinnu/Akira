# AKIRA OS Telemetry Model Specification

All telemetry data structures within AKIRA OS inherit from a unified parent model. This ensures uniform parsing, querying, filtering, and exporting across all observation interfaces.

---

## 1. Unified Telemetry Base Schema

Every log entry, trace span, metric measurement, audit log, system snapshot, and resource record shares the following fields:

```typescript
export type TelemetrySeverity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export interface TelemetryBase {
  /** UTC ISO-8601 string when the telemetry record was generated */
  readonly timestamp: string;

  /** High-resolution monotonic timestamp (in nanoseconds) */
  readonly monotonicTimestamp: string;

  /** Unique identifier of the originating subsystem (e.g., "planning", "workspace") */
  readonly moduleId: string;

  /** Identifier correlating this telemetry to an initiating action or event */
  readonly correlationId: string;

  /** Trace identifier linking associated span operations (optional) */
  readonly traceId?: string;

  /** The execution context severity level */
  readonly severity: TelemetrySeverity;

  /** Extensible key-value metadata container for runtime tags */
  readonly metadata: Readonly<Record<string, string | number | boolean>>;

  /** Source file or component name that produced the record */
  readonly source: string;

  /** Version of the telemetry schema definition (currently "1.0.0") */
  readonly version: string;
}
```

---

## 2. Concrete Telemetry Models

### 2.1. MetricRecord
Captures structured measurements for time-series aggregation.

* **Purpose**: Tracks system throughput, task execution duration, counts, and resource levels.
* **Schema**:
  ```typescript
  export type MetricType = "counter" | "gauge" | "histogram";

  export interface MetricRecord extends TelemetryBase {
    readonly type: "metric";
    readonly metricName: string;
    readonly metricType: MetricType;
    readonly value: number;
  }
  ```
* **Relationships**: Relates directly to target modules via `moduleId`.

---

### 2.2. LogRecord
Represents a structured log entry containing context payload.

* **Purpose**: Records system flow checkpoints, runtime events, and error stack traces.
* **Schema**:
  ```typescript
  export interface LogRecord extends TelemetryBase {
    readonly type: "log";
    readonly message: string;
    readonly stackTrace?: string; // Captures Error.stack on error/fatal levels
  }
  ```

---

### 2.3. TraceRecord (SpanRecord)
Documents a distinct boundary execution span.

* **Purpose**: Analyzes synchronous and asynchronous execution latencies, performance bottlenecks, and call graphs.
* **Schema**:
  ```typescript
  export interface TraceRecord extends TelemetryBase {
    readonly type: "trace";
    readonly spanId: string;
    readonly parentSpanId: string | null;
    readonly spanName: string;
    readonly durationMs: number; // Time difference: (endTime - startTime) in milliseconds
    readonly status: "ok" | "error";
    readonly events: ReadonlyArray<{
      name: string;
      timestamp: string;
      attributes?: Record<string, any>;
    }>;
  }
  ```
* **Relationships**: Can link hierarchically to a parent trace record via `parentSpanId`.

---

### 2.4. AuditRecord
Captures security and compliance-related access events.

* **Purpose**: Provides a secure trail of user permissions, vault encryptions, access authorization, and security status.
* **Schema**:
  ```typescript
  export interface AuditRecord extends TelemetryBase {
    readonly type: "audit";
    readonly actorId: string;
    readonly action: string;
    readonly targetId: string;
    readonly auditStatus: "success" | "denied" | "error";
    readonly payloadHash: string; // SHA-256 hash of the payload
    readonly chainHash: string;   // Cryptographic hash linking this record to the previous audit record
  }
  ```

---

### 2.5. DiagnosticRecord
Captures full-system or module-specific memory and state snapshots.

* **Purpose**: Analyzes diagnostic state post-mortem or in response to a fatal system crash.
* **Schema**:
  ```typescript
  export interface DiagnosticRecord extends TelemetryBase {
    readonly type: "diagnostic";
    readonly snapshotId: string;
    readonly triggerReason: string;
    readonly statePayload: Readonly<Record<string, any>>;
  }
  ```

---

### 2.6. HealthRecord
Tracks health rule evaluation scores and states.

* **Purpose**: Records periodic health evaluation results across subsystems.
* **Schema**:
  ```typescript
  export interface HealthRecord extends TelemetryBase {
    readonly type: "health";
    readonly componentId: string;
    readonly healthStatus: "healthy" | "degraded" | "critical";
    readonly failureRationale?: string;
    readonly detailsPayload?: Readonly<Record<string, any>>;
  }
  ```

---

### 2.7. ResourceRecord
Stores snapshots of physical host or runtime resource consumption.

* **Purpose**: Profiles CPU load, system memory leaks, event loop latency, and file system utilization.
* **Schema**:
  ```typescript
  export interface ResourceRecord extends TelemetryBase {
    readonly type: "resource";
    readonly cpuLoadPercentage: number;
    readonly memoryRssBytes: number;
    readonly heapUsedBytes: number;
    readonly eventLoopLagMs: number;
    readonly diskFreeBytes: number;
  }
  ```

---

## 3. Immutability Guarantees
* **Strict Readonly Properties**: In TypeScript, all model parameters use the `readonly` specifier.
* **Runtime Freezing**: The collection engine runs `Object.freeze()` on all telemetry record instances prior to queueing. Once created, a record cannot be altered.

---

## 4. Serialization & Storage Schemas
* **JSON Serialization**: Telemetry records are serialized to structured JSON strings for export and transmission.
* **Database Optimization**: When written to the SQLite database, common metadata fields are indexed, while telemetry-specific fields (e.g. `statePayload` or `detailsPayload`) are packed as compressed binary JSON blobs to optimize disk space.
