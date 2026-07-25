# AKIRA OS Observability Platform — Metrics Engine

This document defines the architecture, behaviors, lifecycle, performance, and best practices for the Metrics Subsystem within the AKIRA OS Observability Platform. The Metrics Engine serves as the primary quantitative measurement module, providing complete, thread-safe, and deterministic instrumentation for all operating system and user-space components.

---

## 1. Architecture

The Metrics Subsystem builds on top of the foundation provided by the Telemetry Core:

```text
    Metric Registry (SimpleMetricRegistry)
           │
           ├──► Counter (CounterImpl)
           ├──► Gauge (GaugeImpl)
           ├──► Timer (TimerImpl)
           └──► Histogram (HistogramImpl)
                   │
                   ▼ (getSnapshot())
             MetricSnapshot (Immutable)
                   │
                   ▼ (factory.createMetric())
             MetricRecord (TelemetryRecord)
                   │
                   ▼
           Telemetry Pipeline
                   │
                   ▼
              Terminal Sink (SQLite WAL / Console / Exporters)
```

---

## 2. Metric Types & Lifecycle

### 2.1. Counter
*   **Definition**: A monotonic, cumulative value that can only increase (unless reset).
*   **Properties**: `increment()`, `getValue()`, `reset()`.
*   **Usage**: Tracking system calls, query counts, error rates.

### 2.2. Gauge
*   **Definition**: Represents the latest instantaneous measurement, which can fluctuate.
*   **Properties**: `set()`, `increase()`, `decrease()`, `getValue()`.
*   **Usage**: Memory footprints, CPU loads, connection pools.

### 2.3. Timer
*   **Definition**: Measures execution durations using the host's monotonic clock.
*   **Properties**: `start()`, `record()`, `getAverage()`, `getMin()`, `getMax()`.
*   **Usage**: Latency profiling, transaction tracking.

### 2.4. Histogram
*   **Definition**: Evaluates the distribution of recorded values across pre-allocated ranges. Computes averages and exact percentiles (P50, P90, P95, P99) by sorting recorded sets.
*   **Properties**: `record()`, `getPercentile()`, `getHistogramData()`.
*   **Usage**: Response payload sizes, request latency profiling.

---

## 3. Metric Registry API

The registry coordinates the creation, lifecycle validation, and discovery of metrics. It guarantees that metrics are identified uniquely by their `name` combined with a sorted, serialized string of their `labels`.

### 3.1. Primitives
*   `register(metric: Metric): void`: Registers an instantiated metric.
*   `unregister(name: string, labels?: MetricLabelSet): void`: Removes a metric from active storage.
*   `find(name: string, labels?: MetricLabelSet): Metric | undefined`: Returns a metric if it matches the key.
*   `list(): Metric[]`: Returns all active metrics.
*   `exists(name: string, labels?: MetricLabelSet): boolean`: Checks if a metric matches key.

---

## 4. Aggregation Subsystem

The `MetricAggregator` is designed to be completely independent of storage, allowing callers to aggregate lists of `MetricDataPoint` elements on demand:

*   **Count / Sum**: Total samples and mathematical sum.
*   **Average**: Computes the mean of the data points.
*   **Minimum / Maximum**: Extreme bounds within the sample set.
*   **Latest**: Extracts the value with the newest timestamp.
*   **Rate**: Calculates unit changes per second over a time range.
*   **Moving Average**: Evaluates a chronological sliding average of window size $N$.

---

## 5. Performance Characteristics

*   **Metric Recording (Hot Path)**: `< 0.2 microseconds` average overhead. Updates are processed synchronously and do not execute heap allocations.
*   **Metric Lookup**: `O(1)` complexity via sorting label keys and matching them in a fast Hash Map.
*   **Snapshot Creation**: `O(n)` complexity, generating deep-frozen snapshots to isolate thread-safety during exports.

---

## 6. Code Examples

### 6.1. Registering & Updating Metrics
```typescript
import { metrics } from "src/observability";

// Counter Example
const httpRequests = metrics.counter("http.requests", "1", { method: "GET" });
httpRequests.increment();

// Gauge Example
const activeConnections = metrics.gauge("db.active_connections", "count");
activeConnections.set(12);
activeConnections.increase(2);
activeConnections.decrease(1);
```

### 6.2. Profiling Duration with Timers
```typescript
import { metrics } from "src/observability";

const loadTime = metrics.timer("workspace.load_time", "ms", { type: "cold" });

// Start tracking duration
const activeTimer = loadTime.start();

try {
  await loadWorkspace();
} finally {
  // Concludes profiling, records duration, and releases resources
  const duration = activeTimer.stop();
  console.log(`Workspace loaded in ${duration}ms`);
}
```

---

## 7. Extension Points

1.  **Exporters**: Custom pipeline sinks can be attached to the telemetry pipeline to stream metric snapshots to TSDB databases (InfluxDB, Prometheus, OpenTelemetry).
2.  **Sampling Middlewares**: Inject pipeline filters to only export metrics when snapshots exceed threshold bounds.

---

## 8. Best Practices

*   **Avoid High Cardinality Labels**: Do not inject UUIDs, timestamps, or raw URLs as label values. High label variation creates large key pools, increasing lookup memory. Keep label values to small, predefined enums (e.g. `method`, `status`, `env`).
*   **Profile inside finally blocks**: Always close Timers in `finally` blocks to guarantee recording even in the event of throw conditions.
