# AKIRA OS Observability API Specification

This document defines the complete, production-ready public interfaces, contracts, and usage guidelines for the AKIRA OS Observability Platform. All business modules must consume these interfaces via Dependency Injection or service discovery.

---

## 1. Core Facade Interface

### TelemetryService
The unified entry point for all runtime observability operations.

```typescript
import { MetricsFacade } from "./metrics";
import { LoggerFacade } from "./logging";
import { TracerFacade } from "./tracing";
import { DiagnosticsFacade } from "./diagnostics";
import { HealthFacade } from "./health";
import { AuditFacade } from "./audit";
import { ResourceFacade } from "./resources";

export interface TelemetryService {
  readonly metrics: MetricsFacade;
  readonly logger: LoggerFacade;
  readonly tracer: TracerFacade;
  readonly diagnostics: DiagnosticsFacade;
  readonly health: HealthFacade;
  readonly audit: AuditFacade;
  readonly resources: ResourceFacade;
}
```

---

## 2. Child Facades & Contracts

### 2.1. Metrics Facade
Provides APIs to record operational counters, gauge levels, and value distributions.

```typescript
export type MetricTags = Record<string, string | number | boolean>;

export interface MetricsFacade {
  /**
   * Increments a monotonic counter by a specified value.
   * Useful for tracking total volume, error counts, and completed actions.
   */
  increment(name: string, value?: number, tags?: MetricTags): void;

  /**
   * Sets a gauge value representing an instantaneous measurement.
   * Useful for CPU usage, memory utilization, queue sizes, and status codes.
   */
  gauge(name: string, value: number, tags?: MetricTags): void;

  /**
   * Records a value in a distribution/histogram.
   * Useful for response latencies, execution times, and request payloads sizes.
   */
  histogram(name: string, value: number, tags?: MetricTags): void;
}
```

### 2.2. Logger Facade
Handles structured, contextual logging. Automatically attaches correlation details from active execution spans.

```typescript
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogContext = Record<string, any>;

export interface LoggerFacade {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  fatal(message: string, error?: Error, context?: LogContext): void;
  
  /**
   * Re-evaluates logging levels dynamically at runtime.
   */
  setLevel(level: LogLevel): void;
}
```

### 2.3. Tracer Facade
Enables granular execution tracing, profiling, and contextual correlation across execution threads.

```typescript
export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly startTime: bigint; // Monotonic high-resolution start time

  /**
   * Sets custom attributes/tags on the span.
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * Record a custom event inside this span (e.g. "cache_miss").
   */
  addEvent(name: string, attributes?: Record<string, any>): void;

  /**
   * Mark the span as errored and record the exception details.
   */
  recordException(error: Error): void;

  /**
   * Closes the span, computes duration, and dispatches it to the collection queue.
   */
  end(): void;
}

export interface TracerFacade {
  /**
   * Starts a new span. If an active trace context exists, it is linked as a parent.
   */
  startSpan(name: string, options?: { parentSpanId?: string; attributes?: Record<string, any> }): Span;

  /**
   * Executes a synchronous or asynchronous function wrapped within a span.
   * Context is propagated automatically to all nested operations.
   */
  trace<T>(name: string, fn: (span: Span) => T | Promise<T>, attributes?: Record<string, any>): Promise<T>;
}
```

### 2.4. Diagnostics Facade
Captures raw debug info and system state dumps to analyze problems post-mortem.

```typescript
export interface DiagnosticSnapshot {
  readonly snapshotId: string;
  readonly timestamp: string;
  readonly reason: string;
  readonly payload: Record<string, any>;
}

export interface DiagnosticsFacade {
  /**
   * Triggers an immediate system dump of active module states.
   */
  captureSnapshot(reason: string, extraContext?: Record<string, any>): DiagnosticSnapshot;

  /**
   * Registers a callback that supplies metadata to include in diagnostic snapshots.
   */
  registerProvider(moduleId: string, providerFn: () => Record<string, any>): void;
}
```

### 2.5. Health Facade
Coordinates the registration and execution of health rule evaluation checks.

```typescript
export type HealthStatus = "healthy" | "degraded" | "critical";

export interface HealthCheckResult {
  readonly componentId: string;
  readonly status: HealthStatus;
  readonly rationale: string;
  readonly details?: Record<string, any>;
  readonly lastCheckTime: string;
}

export interface HealthFacade {
  /**
   * Evaluates the health status of a single registered component.
   */
  checkComponent(componentId: string): Promise<HealthCheckResult>;

  /**
   * Evaluates the health status of all registered subsystems.
   */
  checkAll(): Promise<HealthCheckResult[]>;

  /**
   * Registers a subsystem health checker rule.
   */
  registerChecker(componentId: string, checkerFn: () => Promise<Omit<HealthCheckResult, "componentId" | "lastCheckTime">>): void;
}
```

### 2.6. Audit Facade
Secure audit trail recorder for high-importance operations (security, access, modifications).

```typescript
export interface AuditEventPayload {
  readonly actorId: string;     // User identifier or system service ID
  readonly action: string;      // Action attempted (e.g. "vault.decrypt")
  readonly targetId: string;    // Resource identifier acted upon
  readonly status: "success" | "denied" | "error";
  readonly details: Record<string, any>;
}

export interface AuditFacade {
  /**
   * Records a security event. Computes HMAC-SHA256 of the record payload
   * combined with previous record hash to establish a tamper-evident audit chain.
   */
  recordSecurityEvent(event: AuditEventPayload): void;
}
```

### 2.7. Resource Facade
Monitors hardware and virtual execution resources of the local host.

```typescript
export interface ResourceSnapshot {
  readonly cpuLoadPercentage: number;
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
  readonly activeHandles: number;
  readonly activeRequests: number;
  readonly eventLoopLagMs: number;
  readonly freeDiskBytes: number;
}

export interface ResourceFacade {
  /**
   * Returns a snapshot of system resource utilization.
   */
  getCurrentUsage(): Promise<ResourceSnapshot>;
}
```

---

## 3. Extension Rules
* **Exporters**: Custom target exporters (e.g., HTTP OpenTelemetry, File-System Logs) must implement the `TelemetryExporter` contract:
  ```typescript
  export interface TelemetryExporter {
    export(records: ReadonlyArray<any>): Promise<void>;
    shutdown(): Promise<void>;
  }
  ```
* **Health Checkers**: Subsystems must register their health checks during their initialization lifecycle, utilizing the `TelemetryService.health.registerChecker()` API.

---

## 4. Concurrency & Context Propagation
* **Thread Safety**: In single-threaded JavaScript runtimes (Node.js, Bun), database writes and file logging are executed asynchronously via macrotasks. Spans and contextual metadata utilize `AsyncLocalStorage` to ensure that callback routines maintain the same trace and correlation context as their initiating operations without manual propagation.
* **Non-Blocking Guarantee**: All metrics increment, gauge, and logging calls are synchronous API returns. Under the hood, they append to an in-memory queue. The CPU cycles consumed by the instrumentation call are bounded at `< 0.1ms`.

---

## 5. Failure Behavior
* **Fail-Silent Execution**: Under no circumstances will a telemetry call throw an unhandled exception. Try-catch blocks wrap all serializations and disk writes.
* **Overflow Policy**: If the ring buffer exceeds its performance limits, the platform defaults to discarding logs/traces based on a severity filter (discarding debug logs first) to safeguard system stability.
