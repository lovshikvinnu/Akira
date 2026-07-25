# AKIRA OS Observability Performance Specification

This document defines the strict performance budgets, latency targets, memory constraints, and sampling policies to ensure the Observability Platform remains transparent and lightweight under high-throughput production execution.

---

## 1. Metric Targets & Budgets

The following thresholds are invariants. The telemetry platform must be regularly verified against these constraints:

| Metric | Target | Maximum Ceiling | Measurement Method |
| :--- | :--- | :--- | :--- |
| **API Logging Latency** | `< 0.05 ms` | `0.10 ms` | CPU time spent in `telemetry.logger.*` |
| **API Tracing Latency** | `< 0.08 ms` | `0.15 ms` | CPU time spent in `telemetry.tracer.startSpan` |
| **Telemetry Heap Overhead** | `< 8 MB` | `15 MB` | Memory footprint of in-memory queues |
| **Database Write Latency** | `Asynchronous` | `Non-blocking` | Background worker thread write cycles |
| **Event Loop Lag Impact** | `< 1.0 ms` | `2.0 ms` | Max block duration of batch serializer |
| **Disk Write Rate** | `< 10 KB/s` | `50 KB/s` | Continuous disk write bandwidth |

---

## 2. Resource Allocation & Limits

* **Maximum Queue Size**: The ring buffer has a strict capacity limit of **10,000 records**. If the buffer reaches this limit due to high storage load, additional trace spans and debug logs are dropped, prioritizing system runtime stability over observability detail.
* **CPU Limit**: In multi-threaded environments, file rotation and database index checks are run on worker threads with low priority, capping observability CPU consumption at `3%` of a single CPU core.
* **Disk Quota**: The total size of `telemetry.db` is capped at **500MB**. When this quota is exceeded, the database automatically invokes aggressive pruning rules (deleting the oldest traces first).

---

## 3. In-Memory Buffering & Serialization
* **Object Pooling**: To prevent memory fragmentation and garbage collection overhead, the tracing module reuses `Span` object instances from a pre-allocated pool rather than creating new objects on every trace call.
* **Lazy String Evaluation**: Log statements avoid string formatting costs if the current logging level is lower than the statement severity:
  ```typescript
  // Fast Path: Log levels are evaluated immediately before parameters are parsed
  if (logger.isEnabled("debug")) {
    logger.debug(`Result computation: ${heavyComputation()}`);
  }
  ```

---

## 4. Sampling Strategy
To optimize database growth and minimize serialization costs, traces and logs are subject to a tiered sampling strategy:

```text
               [ High-Throughput Telemetry Event ]
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
       [ Audit / Alert ]     [ Error / Fatal ]  [ Debug Traces ]
              │                 │                 │
              ▼                 ▼                 ▼
          [ 100% ]          [ 100% ]           [ 10% ] (Adaptive)
```

* **100% Auditing & Errors**: Security audit records and log levels `error` and `fatal` are never sampled. They must be recorded.
* **10% Debug Tracing (Adaptive)**: Standard trace spans default to 10% sampling. Under high load (measured via event-loop lag > 25ms), the sampling engine dynamically reduces trace collection to 1% to mitigate latency spikes.

---

## 5. Failure Isolation & Resilience
* **Circuit Breakers**: If the SQLite write transaction encounters consecutive locking exceptions (e.g. database file locked), a circuit breaker trips, disabling storage logs for **10 seconds** and keeping them only in memory to protect system execution from disk failures.
* **Silent Dropping**: When a serialization fails, it is logged to the standard terminal process console without throwing an application-level exception.
