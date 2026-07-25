# AKIRA OS Observability Platform Architecture

## 1. Vision
The Observability Platform is the unified, high-performance, non-blocking telemetry engine for AKIRA OS. It provides granular runtime visibility into system execution, component health, and hardware resource utilization. 

Designed for long-running desktop companion sessions and future cloud synchronization, it aggregates and persists metrics, traces, structured logs, diagnostics, system health status, resource utilization, and secure audit trials. It maintains an absolute separation between telemetry collection and data interpretation, serving as a passive collector of system facts.

---

## 2. Responsibilities
The Observability Platform is strictly limited to:
* **Passive Telemetry Generation**: Offering lightweight, high-performance APIs for modules to record operational metrics, lifecycle logs, and execution trace spans.
* **Buffering & Aggregation**: Batching and queueing telemetry records asynchronously to avoid disk write overhead on business execution threads.
* **Deterministic Persistence**: Writing structured records to dedicated local storage models (SQLite database and append-only files) in an immutable format.
* **Context Propagation**: Correlating cross-system operations via parent/child trace contexts and correlation IDs across synchronous and asynchronous boundaries.
* **Health & Diagnostics Checks**: Running deterministic, rule-based status assessments on registered components.
* **Secure Audit Logging**: Capturing high-priority security events (authorization, resource access) in a tamper-resistant format.
* **Resource Monitoring**: Tracking CPU, Memory, Disk, and JavaScript Engine thread loop metrics.

---

## 3. Non-Goals
To maintain architectural purity, the Observability Platform will **never**:
* **Perform AI or Cognitive Logic**: Telemetry analysis, reasoning, and pattern recognition are the exclusive domain of higher-level cognitive services (e.g., GENESIS reflection engines).
* **Interpret Telemetry**: The platform records facts (e.g., event loop lag is 40ms) but never decides if this is "bad" or triggers automated remediations.
* **Make Recommendations**: The platform will not recommend index changes, process terminations, or structural refactoring.
* **Alter Execution Flow**: It operates as a passive observer. Telemetry failures, buffer overflows, or database locks must never block or alter the execution of business logic.
* **Own Domain-Specific Knowledge**: It is unaware of what a "project", "task", or "user goal" represents biologically or semantically; it only knows generic telemetry schemas (module ID, payload, metrics, timestamp).
* **Automate Optimizations**: It does not self-tune database parameters, clean workspaces, or manage OS memory.

---

## 4. Design Principles
* **Passive Observation**: The presence or absence of observability instrumentation must not change the deterministic outcome of a business routine.
* **Interface-First Contract**: All business modules communicate only with interfaces defined in the API layer. No domain component imports concrete storage, collectors, or exporters.
* **Fail-Safe & Fail-Silent Isolation**: If the storage engine fills up or the collection queue overflows, the observability platform discards telemetry records silently rather than raising runtime exceptions that crash the OS.
* **Immutable Storage**: Once recorded, telemetry files and database rows are read-only and append-only. They are pruned only through automatic sliding-window lifecycle rules.
* **Asynchronous Processing**: Telemetry recording operations are non-blocking, delegating serialization and filesystem I/O to background microtasks or worker threads.

---

## 5. Architecture Overview
The platform is organized into four strictly separated horizontal layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Instrumentation Layer                         │
│   (TelemetryService, Decorators, Spans, Logger, Metrics, Audit API)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Asynchronous Push)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            Collection Layer                            │
│   (Asynchronous Ring Buffers, Batch Processors, Metric Aggregators)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Structured Batches)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                              Storage Layer                             │
│  (SQLite Repositories, File Exporters, Retention, Cryptographic Hashing)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Query API / Reads)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           Presentation Layer                           │
│     (Diagnostics Dashboard API, Console Exporter, JSON Dumpers)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Layer Responsibilities

### 6.1. Instrumentation Layer
* **Role**: Exposes the public API utilized by core AKIRA OS modules to generate telemetry data.
* **Components**: `TelemetryService`, `@Trace` decorators, logging hooks, resource monitors.
* **Constraint**: Must depend only on the interfaces defined by the `Collection` layer. It has zero awareness of SQLite, exporters, or visualization.

### 6.2. Collection Layer
* **Role**: Buffers raw telemetry events, aggregates high-frequency metrics (e.g., counting repeated calls over 1 second), and coordinates batch processing.
* **Components**: Ring Buffers, Batching Processors, Metric Aggregators, Context Managers (using `AsyncLocalStorage` for context propagation).
* **Constraint**: Depends only on the interfaces of the `Storage` layer. Must not import any concrete database classes or exporters.

### 6.3. Storage Layer
* **Role**: Houses the persistence adapters that write structured telemetry records to physical disk and forwards them to registered exporters.
* **Components**: SQLite repository, File-backed append logs, OpenTelemetry exporters.
* **Constraint**: Depends only on pure, platform-independent database schemas and file streams. It has no awareness of the instrumentation API or the dashboard views.

### 6.4. Presentation Layer
* **Role**: Provides query interfaces, console representations, and structured diagnostic endpoints to inspect the stored telemetry.
* **Components**: Dashboard Query Service, Console Exporters, JSON Diagnostic dumpers.
* **Constraint**: Connects strictly to the read-only query interfaces of the `Storage` layer.

---

## 7. Component Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TelemetryService (Facade)                        │
├──────────────┬──────────────┬──────────────┬───────────────┬────────────────┤
│   Metrics    │    Logger    │    Tracer    │  Diagnostics  │     Health     │
│   Facade     │    Facade    │    Facade    │    Facade     │     Facade     │
└──────┬───────┴──────┬───────┴──────┬───────┴───────┬───────┴────────┬───────┘
       │              │              │               │                │
       ▼              ▼              ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Asynchronous Collection                          │
│     - RingBuffer (Log/Trace/Metric ingestion)                               │
│     - ContextManager (AsyncLocalStorage context propagation)                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Storage & Exporters                              │
│     - TelemetryRepository (SQLite)     - AuditLogger (HMAC-SHA256 File)     │
│     - FileExporter (Aggregated Logs)    - OpenTelemetryExporter              │
└─────────────────────────────────────────────────────────────────────────────┘
```

* **TelemetryService (Facade)**: The single entry point for AKIRA OS code to output telemetry.
* **ContextManager**: Maintains a thread-safe execution context that automatically associates Trace ID, Span ID, Session ID, and Module ID with all downstream logs and metric outputs.
* **RingBuffer**: A fixed-size memory array that acts as a buffer. Under spike conditions, it prevents memory leaks by dropping oldest records first (backpressure).
* **TelemetryRepository**: SQLite implementation that stores logs, metric history, trace spans, and resource utilization.
* **AuditLogger**: A highly secure logger that writes compliance and security events to append-only files, computing cryptographic hashes (HMAC-SHA256) per log line to detect tampering.

---

## 8. Dependency Rules
To prevent architectural drift and circular references, the following dependency constraints are enforced:
1. **Unidirectional Control Flow**: Downward dependency rule (`Instrumentation` -> `Collection` -> `Storage` -> `Presentation`). No upstream imports are allowed.
2. **Business Separation**: Core business modules (such as Tasks, Projects, Workspace, and GENESIS) must **never** import concrete files from the collection or storage layers. They must only interact with `TelemetryService` and its child facades.
3. **No Domain Imports**: `src/observability/` must never import modules from `src/genesis/` or other domain business folders. It is completely generic and domain-agnostic.

---

## 9. Runtime Interaction & Async Boundary
To isolate telemetry collection from core operations, all telemetry recording follows an asynchronous offloading boundary:

```
[Business Subsystem] (e.g. Task Creation)
        │
        │ 1. TelemetryService.logger.info("Task Created", { taskId })  [Synchronous API Call]
        ▼
[TelemetryService]
        │
        │ 2. Construct immutable LogRecord + Capture Monotonic Timestamp
        │ 3. Push LogRecord into RingBuffer
        │ 4. Immediately Return (Control handed back to Business Subsystem)
        ▼
[RingBuffer (In-Memory Queue)]  <--- Asynchronous Boundary --->
        │
        │ 5. Event loop idle / timer fires (Batch size reached or interval elapsed)
        ▼
[Batching Processor]
        │
        │ 6. Extract records from RingBuffer
        │ 7. Perform SQLite batch insert / Export to files in background macrotask
        ▼
[SQLite Telemetry Database / Append-Only Files]
```

---

## 10. Integration & Extension Strategy
* **Event Bus Integration**: An observability subscriber listens to critical lifecycle events on the main `EventBus` and records them as structured telemetry entries automatically.
* **OpenTelemetry Exporter Extension**: The `exporters/` package defines a standard `TelemetryExporter` interface. Adding OpenTelemetry support simply requires writing an `OTelExporter` implementation and registering it in the storage bootstrapper, requiring zero alterations to the instrumentation APIs or domain code.
