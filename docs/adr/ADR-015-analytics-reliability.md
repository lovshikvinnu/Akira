# ADR-015: Analytics Subsystem Reliability & Self-Recovery

## Status
Accepted

## Context
The Analytics subsystem derives state tables (`daily_metrics`, `project_metrics`) from the append-only Event Store containing immutable `AkiraEvent` records. 

To guarantee that Analytics is production-ready, it must be:
1.  **Deterministic**: Running a complete re-aggregation on a sequence of events must always yield the exact same metrics.
2.  **Recoverable**: If the derived tables are corrupted, cleared, or out of sync due to software crashes, the system must be capable of rebuilding all records from source logs.
3.  **Fault Tolerant**: A single malformed event payload (e.g. invalid JSON syntax or missing keys) must not halt the indexing of the rest of the workspace history.
4.  **Performant**: A full rebuild or query must scale linearly ($O(N)$) and query speeds must remain low enough for immediate dashboard loads.

## Decision
We implement a three-tiered Reliability Framework inside `src/analytics/validation/`:

1.  **Historical Rebuild Manager (`RebuildManager`)**:
    *   Exposes `.rebuildAll()` and `.rebuildIncremental()`.
    *   Wipes derived metrics and re-aggregates events.
    *   Persists progress metadata (`lastProcessedEventId`, `lastProcessedTimestamp`, `lastSuccessfulRebuild`, `schemaVersion`) inside a dedicated `analytics_state` table to enable resuming interrupted runs and doing incremental aggregations.
    *   Wraps event parsing in fault-tolerant exception handlers. If the primary `EventRepository` fails to deserialize any event because of JSON corruption, the loader falls back to raw database row streams, isolating parse errors to the individual corrupted row.

2.  **Consistency Checker (`ConsistencyChecker`)**:
    *   Exposes `.checkConsistency()`.
    *   Scans raw events and computes expected metrics in-memory, comparing them directly against columns in `daily_metrics` and `project_metrics`.
    *   Identifies mismatches (e.g. task count discrepancies, session duration mismatches, orphaned project metrics) and returns structured diagnostic reports.

3.  **Structural Diagnostics (`AnalyticsValidator` & `DiagnosticsService`)**:
    *   Exposes `.validateDatabase()` and `.validateDashboardDTO()`.
    *   Performs database integrity checks (table columns, negative values, out-of-bounds metrics) and validates runtime dashboard payloads.
    *   Aggregates health status into `HEALTHY`, `DEGRADED` (for value mismatches), or `UNHEALTHY` (for structural database errors).

## Consequences

### Positive
*   **Zero-Loss Recovery**: Derived tables can be deleted or wiped at any time; the system recovers completely within milliseconds.
*   **Safe Migration Upgrades**: Analytics schema upgrades can be easily deployed by incrementing `schema_version`, wiping the derived tables, and triggering `.rebuildAll()`.
*   **Production Stability**: Corrupted events from legacy clients are ignored, preventing system-wide crashes.
*   **Operational Visibility**: Provides deep diagnostics and consistency reports for dashboard interfaces and operational health.

### Negative
*   **Direct DB Fallback Dependency**: To support isolating row parsing failures, the rebuild manager depends on direct SQLite fallback queries, bypassing the repository wrapper when mapping raw corrupted JSON. This is acceptable as a fallback mechanism.
*   **Locking Overhead**: Rebuilding derived tables on extremely large datasets (e.g., millions of events) takes locked database transaction time. This is offset by utilizing incremental rebuilds by default.
