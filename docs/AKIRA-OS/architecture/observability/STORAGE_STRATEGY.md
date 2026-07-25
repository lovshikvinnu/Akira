# AKIRA OS Observability Storage Strategy

This document specifies the persistence layout, SQL schemas, write optimization, indexing strategy, data retention policy, and cleanup processes for telemetry data.

---

## 1. Database Engine & Schema Definitions

AKIRA OS uses a dedicated local **SQLite database** (`telemetry.db`) located in the application workspace for metrics, structured logs, diagnostics snapshots, health checks, and system resource profiles.

```sql
-- 1. Unified Telemetry Table (Optimized for append-heavy writes)
CREATE TABLE IF NOT EXISTS telemetry_records (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,                -- ISO-8601 UTC timestamp
    monotonic_timestamp INTEGER NOT NULL,    -- Monotonic nanoseconds
    module_id TEXT NOT NULL,                -- Origin module name
    correlation_id TEXT NOT NULL,           -- Correlation ID
    trace_id TEXT,                          -- Trace ID (nullable)
    severity TEXT NOT NULL,                 -- DEBUG, INFO, WARN, ERROR, FATAL
    record_type TEXT NOT NULL,              -- metric, log, trace, diagnostic, health, resource
    source TEXT NOT NULL,                   -- Source code reference
    version TEXT NOT NULL,                  -- Schema version (e.g. 1.0.0)
    metadata TEXT,                          -- Compressed JSON String (nullable)
    
    -- Type-specific fields (flat structure for quick filtering)
    metric_name TEXT,
    metric_type TEXT,
    metric_value REAL,
    
    log_message TEXT,
    log_stack_trace TEXT,
    
    span_id TEXT,
    parent_span_id TEXT,
    span_name TEXT,
    span_duration_ms REAL,
    span_status TEXT,
    span_events TEXT,                       -- JSON Array string
    
    diagnostic_snapshot_id TEXT,
    diagnostic_reason TEXT,
    diagnostic_payload TEXT,                -- Large JSON payload blob
    
    health_component_id TEXT,
    health_status TEXT,
    health_rationale TEXT,
    
    cpu_percent REAL,
    memory_rss_bytes INTEGER,
    memory_heap_bytes INTEGER,
    event_loop_lag_ms REAL,
    disk_free_bytes INTEGER
);
```

---

## 2. Writing Optimization (Buffering & Batching)

Directly writing individual records to SQLite on every log or span end causes high write latency and disk wear. The platform implements the following optimizations:

* **Write-Ahead Logging (WAL)**: SQLite database connections run in WAL mode (`PRAGMA journal_mode = WAL;`) allowing concurrent reads and writes, reducing locking overhead.
* **Batch Insertion**: High-speed records are stored in a fixed-size `RingBuffer` (in-memory queue). A scheduler flushes these records to the database using transactional multi-row insertions when:
  * The queue accumulates **100 records** OR
  * **2,000 milliseconds** have elapsed since the last flush.
* **Prepared SQL Statements**: Inserts compile the statement once and execute within a transaction block (`BEGIN TRANSACTION ... COMMIT;`) to achieve write throughput of `5,000+ records/sec`.

---

## 3. Database Indexing Strategy
To ensure query response times remain under `10ms` for dashboard visualization and debugging queries, the following indices are maintained:

```sql
-- Index 1: Core Timestamp sorting for timelines and diagnostic scans
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp 
ON telemetry_records (timestamp DESC);

-- Index 2: Correlation lookup to fetch all telemetry for a given action flow
CREATE INDEX IF NOT EXISTS idx_telemetry_correlation 
ON telemetry_records (correlation_id);

-- Index 3: Trace query lookup to reconstruct execution call trees
CREATE INDEX IF NOT EXISTS idx_telemetry_trace 
ON telemetry_records (trace_id) WHERE trace_id IS NOT NULL;

-- Index 4: Composite metric lookup for time-series aggregation
CREATE INDEX IF NOT EXISTS idx_telemetry_metric 
ON telemetry_records (metric_name, timestamp DESC) WHERE record_type = 'metric';

-- Index 5: Component Health check query lookup
CREATE INDEX IF NOT EXISTS idx_telemetry_health 
ON telemetry_records (health_component_id, timestamp DESC) WHERE record_type = 'health';
```

---

## 4. Retention Policy (Sliding-Window Pruning)

To prevent the local workspace from running out of disk space during continuous execution sessions, telemetry data is subjected to a tiered retention policy:

| Record Type | Retention Window | Pruning Action |
| :--- | :--- | :--- |
| **Traces (Spans)** | 24 Hours | Complete Delete |
| **Logs (Debug & Info)** | 3 Days | Complete Delete |
| **Logs (Warn, Error, Fatal)** | 7 Days | Archive to `.gz` file, then Delete |
| **Metrics (Raw)** | 24 Hours | Aggregate to Hourly/Daily means, then Delete |
| **Metrics (Hourly Aggregates)** | 30 Days | Complete Delete |
| **Audit Logs** | 90 Days | Mandatory Archive to encrypted storage |
| **Diagnostics Snapshots** | 7 Days | Delete if total snapshot storage > 200MB |

---

## 5. Background Cleanup Process

* **Periodic Pruning Scheduler**: A background worker runs every **60 minutes** at low CPU priority, executing database cleanup:
  ```sql
  -- Pruning expired raw traces
  DELETE FROM telemetry_records 
  WHERE record_type = 'trace' 
    AND datetime(timestamp) < datetime('now', '-24 hours');
  
  -- Compacting metrics
  DELETE FROM telemetry_records 
  WHERE record_type = 'metric' 
    AND datetime(timestamp) < datetime('now', '-24 hours');
  ```
* **Database Compaction**: Once a day during event-loop idle periods, the database triggers `VACUUM;` to recover unused database space and rebuild indexes.

---

## 6. Query Strategy
* **Cursors & Pagination**: Dashboard queries always fetch sorted indexes using page limits (`LIMIT 50 OFFSET X`) and cursor-based pagination to avoid loading large record sets into memory.
* **Separation of Read/Write Connections**: Storage exposes a single write connection for the ring-buffer writer and multiple read-only connections for dashboards, preventing write-locks from stalling administrative queries.

---

## 7. Future Scalability
* **Cloud Export Sync**: Exporters are designed to convert structured SQLite rows into standard OpenTelemetry Protocol (OTLP) JSON batches. This enables uploading telemetry to cloud metrics providers (e.g. Prometheus, Datadog) without modifying the local schema or application database.
