# AKIRA OS Observability Data Flow Specification

This document maps the runtime data flow and execution sequence diagrams for ingestion, aggregation, storage, queries, and exports of telemetry.

---

## 1. Metric Recording Flow
High-speed metric increments and value logging are completely decoupled from blocking operations.

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Subsystem (Workspace)
    participant Facade as MetricsFacade
    participant Collector as MetricAggregator
    participant Queue as RingBuffer
    participant Worker as AsyncProcessor
    participant Storage as TelemetryRepository (SQLite)

    Caller->>Facade: increment("workspace.reads", 1, { status: "success" })
    Note over Facade: Build MetricRecord with monotonic timestamp
    Facade->>Collector: aggregate(MetricRecord)
    Note over Collector: Merge high-frequency counts in memory
    Collector->>Queue: push(AggregatedMetricRecord)
    Note over Queue: Non-blocking array push (CPU time < 0.05ms)
    Queue-->>Caller: Instant Return

    Note over Worker: Timer triggers / queue size reached
    Worker->>Queue: pullBatched(size: 100)
    Queue-->>Worker: Read records
    Worker->>Storage: saveMetricsBatch(records)
    Note over Storage: SQLite transactional multi-row insert
```

---

## 2. Trace Recording Flow
Execution trace spans use `AsyncLocalStorage` to associate child spans automatically with their correct parents.

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Subsystem Method
    participant Tracer as TracerFacade
    participant Context as ContextManager (AsyncLocalStorage)
    participant Span as TraceSpan
    participant Queue as RingBuffer
    participant Storage as TelemetryRepository (SQLite)

    Caller->>Tracer: startSpan("calculate_plan_health")
    Tracer->>Context: getActiveContext()
    Context-->>Tracer: ActiveParentSpan (if exists)
    Tracer->>Span: createChildSpan(name, parentSpanId, startNanoTime)
    Tracer->>Context: runWith(childSpan, SubsystemMethod)
    activate Span
    
    Subsystem Method->>Span: setAttribute("plan_id", "plan_123")
    Subsystem Method->>Span: end()
    deactivate Span
    Note over Span: Capture endNanoTime & compute duration
    Span->>Queue: push(TraceRecord)
    Note over Queue: Asynchronous Boundary
    Queue->>Storage: saveTraceSpansBatch()
```

---

## 3. Log Recording Flow
Structured logs automatically inherit trace context from the active execution span.

```text
[Subsystem Call] ──> TelemetryService.logger.info("Task created", { taskId })
                           │
                           ▼
                 [ContextManager] ──(Retrieves active Trace ID and Span ID)
                           │
                           ▼
                  [Build LogRecord]
                           │
                           ▼
                     [RingBuffer]  <─── Asynchronous offloading
                           │
                           ▼
               [Background Log Processor]
                ┌──────────┴──────────┐
                ▼                     ▼
      [SQLite Repository]     [ConsoleReporter] (Format: JSON/Text)
```

---

## 4. Health Check Flow
Health check rules are executed on-demand or on a scheduler. They are deterministic and pure.

```mermaid
sequenceDiagram
    autonumber
    participant Scheduler as System Clock / Dashboard
    participant Facade as HealthFacade
    participant Registry as HealthRuleRegistry
    participant Subsystem as Workspace Subsystem Health Rule

    Scheduler->>Facade: checkAll()
    Facade->>Registry: getRegisteredCheckers()
    Registry-->>Facade: List of component checker callbacks
    loop For Each Component Checker
        Facade->>Subsystem: executeChecker()
        Note over Subsystem: Evaluate logic (e.g. check DB connection, disk space)
        Subsystem-->>Facade: HealthCheckResult (healthy | degraded | critical)
    end
    Note over Facade: Build composite HealthRecord
    Facade-->>Scheduler: Return status results
```

---

## 5. Audit Event Flow
Audit records require cryptographic protection to verify data integrity and prevent tampering.

```mermaid
sequenceDiagram
    autonumber
    participant Auth as Security Subsystem (Vault)
    participant Facade as AuditFacade
    participant Crypto as AuditCryptoManager
    participant File as AuditLogFile (Append-Only)

    Auth->>Facade: recordSecurityEvent({ actorId, action: "decrypt", status: "success" })
    Note over Facade: Create AuditRecord
    Facade->>Crypto: sign(AuditRecord)
    Note over Crypto: Fetch lastChainHash from local state file
    Note over Crypto: Compute recordHash = SHA256(AuditRecord)
    Note over Crypto: Compute newChainHash = HMAC-SHA256(recordHash + lastChainHash)
    Crypto-->>Facade: SignedAuditRecord (payloadHash, chainHash)
    Facade->>File: appendLine(SignedAuditRecord)
    Note over File: Write securely to disk with write lock
```

---

## 6. Dashboard Query Flow
Querying telemetry for display isolates reads from high-speed write targets.

```text
[Dashboard UI] ──> ObservabilityQueryFacade.getTraceSummary("trace_123")
                          │
                          ▼
             [SQLite Read Connection] (Optimized with Read-Ahead WAL)
                          │
                          ▼
            [Query Index on trace_id] (Timestamp-sorted)
                          │
                          ▼
             [Return Trace Details Graph]
```

---

## 7. Storage & Exporter Flow
The storage layer handles direct persistence and dispatches batches to external exporters.

```text
                  [Async Batch Processor]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [TelemetryRepository]             [TelemetryExporter]
  (Writes batches of metrics,        (Forwards telemetry records to
   traces, and logs to SQLite)        OpenTelemetry or Console endpoints)
```

---

## 8. Runtime Instrumentation Flow
How business components leverage the API:

```typescript
import { telemetry } from "src/observability";

class WorkspaceService {
  async loadWorkspace(workspaceId: string) {
    // 1. Automatic Tracing Wrapper
    return telemetry.tracer.trace("workspace.load", async (span) => {
      span.setAttribute("workspace_id", workspaceId);
      
      try {
        // 2. Log Ingestion
        telemetry.logger.info("Attempting to load database file", { workspaceId });
        
        const db = await this.openDb(workspaceId);
        
        // 3. Metric Recording
        telemetry.metrics.increment("workspace.load.success");
        return db;
      } catch (err) {
        // 4. Error Logging and Exception Capture
        span.recordException(err);
        telemetry.logger.error("Failed to load workspace database", err, { workspaceId });
        telemetry.metrics.increment("workspace.load.failure");
        throw err;
      }
    });
  }
}
```
