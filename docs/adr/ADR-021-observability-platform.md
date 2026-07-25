# ADR-021: Observability Platform Architecture

## Status
Accepted

## Context
AKIRA OS v1.8.2 contains several core subsystems (Workspace, Event Bus, Event Store, Compatibility Layer, Lifecycle, etc.). Currently, instrumentation across these modules is ad-hoc, utilizing a mix of simple console logs and specialized event emitters. As the engine moves towards advanced autonomous operations, we require system-wide observability (Metrics, Logs, Traces, Diagnostics, Health, Auditing, and Resource Monitoring).

We must solve these key challenges without degrading performance or reliability:
1. **Coupling**: Domain components (such as GENESIS planning rules) must not import storage adapters or exporters.
2. **Execution Blocking**: Telemetry operations must never block core business threads or user interactions.
3. **Data Integrity**: Auditing and runtime tracking must be tamper-resistant and immutable.
4. **Purity**: Domain calculations must remain pure, side-effect-free, and unaware of telemetry infrastructure internals.

## Decision
We establish the **AKIRA OS Observability Platform**, a decoupled, passive telemetry engine structured into four distinct horizontal layers:

```
┌─────────────────────────────────────────────────────────┐
│                    Instrumentation                      │  (Telemetry APIs, Decorators, Facades)
└───────────────────────────┬─────────────────────────────┘
                            │ (Async Buffering)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                       Collection                        │  (Aggregators, Ring Buffers, Processors)
└───────────────────────────┬─────────────────────────────┘
                            │ (Structured Batches)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                         Storage                         │  (SQLite, Append-Only Files, Exporters)
└───────────────────────────┬─────────────────────────────┘
                            │ (Indexed Read Queries)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      Presentation                       │  (Console, Local Dashboards, File Dumps)
└─────────────────────────────────────────────────────────┘
```

The system will enforce the following architectural patterns:
1. **Unidirectional Dependency Flow**: Code dependencies flow downwards: `Instrumentation` -> `Collection` -> `Storage` -> `Presentation`. No layer can call upwards, and non-observability subsystems may only depend on the public interfaces of `Instrumentation`.
2. **Immutable Unified Telemetry Model**: All telemetry entities (Logs, Metrics, Spans, Audit logs, Diagnostics, Health metrics, Resource snapshots) inherit from a base `Telemetry` record with structured correlation parameters (Trace ID, Span ID, correlation ID).
3. **Asynchronous Non-Blocking Processing**: The API immediately returns after capturing telemetry. Telemetry payloads are offloaded to an asynchronous ring buffer. Failure to record, serialize, or export telemetry will never crash or interrupt business execution (Fail-Safe, Fail-Silent design).
4. **Platform Independence**: Telemetry generation relies purely on standard ECMAScript constructs. Platform-specific adapters (Node.js APIs, SQLite databases) are isolated within the `Storage` and `Collection` layers.

## Alternatives Considered
1. **Alternative A: Integrate OpenTelemetry SDK directly into Business Modules**
   * *Rejected*: Direct OpenTelemetry integration increases bundle sizes and introduces heavy third-party dependencies into lightweight core workspace environments. It violates the pure domain boundaries.
2. **Alternative B: Rely entirely on existing Event Bus / Event Store**
   * *Rejected*: While the Event Store records domain events, it is not optimized for high-frequency logs, metrics (counters, timers), or diagnostic memory dumps. Using the Event Store for tracing would cause severe database contention and performance degradation.
3. **Alternative C: File-Based Log Scraping**
   * *Rejected*: Parsing unstructured text files introduces parsing overhead, lacks structured correlation models, and fails to handle real-time health and diagnostic queries.

## Tradeoffs
* **Observability Overhead**: Adding high-frequency tracing and metrics tracking consumes CPU cycles. We mitigate this by using high-resolution monotonic clocks (`process.hrtime.bigint()`) and offloading serialization to background processing.
* **Storage Consumption**: High-volume tracing can bloat local SQLite databases. We address this with sliding-window retention (7 days for logs, 24 hours for trace spans) and database compaction rules.

## Consequences
* **Decoupling**: Subsystems depend solely on interfaces defined in `src/observability/api/`. Telemetry collection, database tables, and exports can be swapped or modified with zero changes to caller code.
* **Security & Privacy**: Centralizing telemetry allows us to establish uniform scrubbing rules to mask personally identifiable information (PII) before storage.
* **Diagnostics**: Cross-module flows are fully traceable using correlated Span and Parent Span IDs, allowing developers to diagnose latency bottlenecks.
