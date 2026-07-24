# AKIRA OS Platform Documentation — Analytics Subsystem

This document provides a comprehensive guide to the Analytics subsystem implemented in AKIRA OS v1.6.

---

## 1. Overview & Responsibilities

The Analytics subsystem is designed to compile user activity logs and event histories into structured, queryable productivity insights. It operates under strict decoupling constraints:

*   **Read-Only Operations**: Analytics consumes the Event Store but never modifies or publishes business events.
*   **Separation of Concerns**: Calculations are decoupled from persistence and database logic.
*   **Zero Business Coupling**: The analytics engine does not import project, task, note, or session management services. Instead, it operates entirely on the structured payloads of persisted events.

---

## 2. Architecture & Layering

Sprint 2.1 introduces a strict Query Layer that shields consumers (UI, internal modules, and the future GENESIS AI engine) from SQL details or direct repository access.

```
UI / Future GENESIS API
       │
       ▼
┌────────────────────────┐
│    AnalyticsService    │   <-- Validates query params, resolves ranges, maps DTOs
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│      QueryService      │   <-- Executes repository fetches, filters events, runs calculators
└───────────┬────────────┘
            ├──────────────────────────┐
            ▼                          ▼
┌────────────────────────┐   ┌──────────────────┐
│   AnalyticsRepository  │   │  EventRepository │
└───────────┬────────────┘   └──────────┬───────┘
            │                           │
            ▼                           ▼
      Derived Tables               Event Store
      (daily_metrics,              (SQLite DB)
       project_metrics)
```

### 2.1. Layer Roles
1.  **AnalyticsService**: The public platform gateway. Enforces query options validation, converts predefined ranges to UTC boundaries, shifts times based on timezone offset, and maps outcomes into stable DTO structures.
2.  **QueryService**: An internal helper class. It executes queries against `EventRepository` and `AnalyticsRepository`, filters events dynamically based on filter criteria, and executes calculators.
3.  **AnalyticsRepository / EventRepository**: Encapsulate the database transactions.

---

## 3. Data Transfer Objects (DTOs)

The public endpoints return DTOs rather than database rows or internal models. If a query retrieves no events (empty history), default zeroed DTOs are returned rather than `null`.

### 3.1. `DashboardSummaryDTO`
Used by the central status dashboard.
```typescript
interface DashboardSummaryDTO {
  productivityScore: number;
  tasksCompleted: number;
  activeProjects: number;
  sessionDuration: number; // in seconds
  storageActivity: number; // in bytes
  dailyEvents: number;
}
```

### 3.2. `ProductivitySummaryDTO`
Detailed task status.
```typescript
interface ProductivitySummaryDTO {
  completionRate: number; // 0.0 to 1.0
  tasksCreated: number;
  tasksCompleted: number;
  reopenedTasks: number;
  productivityScore: number;
}
```

### 3.3. `ProjectHealthDTO`
Details regarding a specific project.
```typescript
interface ProjectHealthDTO {
  projectId: string;
  activityScore: number;
  completionPercentage: number; // 0.0 to 100.0
  lastActivity: string; // ISO 8601 UTC
  dormant: boolean;
}
```

### 3.4. `SearchInsightsDTO`
Workspace query analysis.
```typescript
interface SearchInsightsDTO {
  searchesExecuted: number;
  repeatedSearches: number;
  mostCommonQueries: { query: string; count: number }[];
}
```

### 3.5. `SessionStatisticsDTO`
Productive focus session statistics.
```typescript
interface SessionStatisticsDTO {
  sessionCount: number;
  totalDuration: number;    // seconds
  averageDuration: number;  // seconds
  longestSession: number;   // seconds
}
```

### 3.6. `ActivityTimelineDTO`
Consecutive streak tracking.
```typescript
interface ActivityTimelineDTO {
  activeDays: number;
  activityStreak: number;
  peakActivityHour: number; // 0-23 local hour
  timeline: { date: string; eventCount: number }[]; // YYYY-MM-DD local
}
```

---

## 4. Query Options & Filters

All public service methods accept a unified `AnalyticsQueryOptions` configuration object:

```typescript
interface AnalyticsQueryOptions {
  range?: "today" | "yesterday" | "last7Days" | "last30Days" | "custom";
  startDate?: string; // required if range is "custom" (ISO date or YYYY-MM-DD)
  endDate?: string;   // required if range is "custom" (ISO date or YYYY-MM-DD)
  filters?: AnalyticsQueryFilters;
}

interface AnalyticsQueryFilters {
  projectId?: string;
  eventType?: string;
  module?: string;             // source module that published the event
  timezone?: string | number;  // timezone offset in minutes (e.g. "+330" or -300)
  aggregationPeriod?: "day" | "week" | "month";
}
```

### Date Range Handling & Validation
The validation layer (`validateAndResolveQuery`):
*   Resolves relative terms (`today`, `yesterday`, etc.) by applying the localized timezone offset to server time and calculating localized midnight boundaries.
*   Rejects query configurations if dates cannot be parsed.
*   Rejects query configurations if `endDate` precedes `startDate`.
*   Rejects query configurations if an invalid/unsupported aggregation period is specified.

---

## 5. Public API Methods

The `AnalyticsService` exposes the following endpoints (available as `analyticsService` singleton):

### Dashboard Endpoints
-   `getDashboardSummary(options)`: Aggregated overview of productivity, sessions, active projects, and vault storage.
-   `getTodaySummary(timezoneOffset)`: High-level dashboard summary for today.
-   `getWeekSummary(timezoneOffset)`: Summary for the last 7 days.
-   `getMonthSummary(timezoneOffset)`: Summary for the last 30 days.

### Productivity Endpoints
-   `getProductivitySummary(options)`: Detailed productivity status including completion rates and reopened counts.
-   `getCompletionRate(options)`: Simple helper returning the ratio of finished tasks.
-   `getProductivityTrend(options)`: Daily chronological array containing productivity scores:
    `{ date: string; productivityScore: number }[]`

### Projects Endpoints
-   `getActiveProjects(options)`: Array of project IDs that received updates in the window.
-   `getDormantProjects(options)`: Array of project IDs that were historically created but have zero events in the window.
-   `getProjectHealth(projectId, options)`: Aggregates activity score, tasks completion percentage, last activity, and dormancy status for a specific project.
-   `getProjectActivity(options)`: Chronological list of project activity scores:
    `{ projectId: string; activityScore: number }[]`

### Activity Endpoints
-   `getActivityTimeline(options)`: Full list of dates with count of events.
-   `getPeakHours(options)`: Hour of the day recording the maximum count of user actions.
-   `getActivityStreak(options)`: The user's maximum consecutive active streak in localized days.

### Vault Endpoints
-   `getStorageActivity(options)`: Sum of bytes added to the Vault.
-   `getUploadHistory(options)`: Daily uploads history:
    `{ date: string; filesUploaded: number; sizeBytes: number }[]`

### Search Endpoints
-   `getSearchInsights(options)`: Search counts and most common queries.
-   `getMostCommonQueries(options)`: Array of top search terms.

### Sessions Endpoints
-   `getSessionStatistics(options)`: Session counts, focus time, average/peak focus.
-   `getFocusStatistics(options)`: Focus durations grouped daily.

---

## 6. Code Examples

### Querying Today's Summary in IST (+5:30)
```typescript
import { analyticsService } from "./src/analytics";

const summary = analyticsService.getTodaySummary(330);
console.log(`Today's productivity score: ${summary.productivityScore}`);
console.log(`Tasks Completed: ${summary.tasksCompleted}`);
```

### Fetching Project Health for custom date range
```typescript
import { analyticsService } from "./src/analytics";

const health = analyticsService.getProjectHealth("my-project-123", {
  range: "custom",
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-15T23:59:59.999Z",
  filters: { timezone: -300 } // EST
});

console.log(`Project Dormancy Status: ${health.dormant}`);
console.log(`Project Completion Percentage: ${health.completionPercentage}%`);
```

---

## 7. Extension Guidelines

To add a new endpoint or metric:
1.  If a new calculator is required, implement the `MetricCalculator` interface and register it in `AnalyticsEngine`.
2.  Add appropriate type contracts to `dto.ts`.
3.  Add query handling logic in `QueryService` (compiling events to DTO).
4.  Expose the public API endpoint in `AnalyticsService`.

---

## 8. Historical Rebuild and Recovery

The Analytics subsystem supports complete self-reconstruction using only the append-only Event Store. This capability is managed by `RebuildManager`.

### 8.1. Rebuild State Table (`analytics_state`)
Rebuild progress is saved in SQLite to allow incremental rebuilds and safe resume on crash:
*   `last_processed_event_id`: The ID of the last successfully processed event.
*   `last_processed_timestamp`: The ISO timestamp of the last processed event.
*   `last_successful_rebuild`: Timestamp of the last rebuild completion.
*   `schema_version`: Active analytics schema version (defaults to `1`).

### 8.2. Operations Lifecycle
1.  **Full Rebuild**: Triggers `.rebuildAll()`. Wipes `daily_metrics`, `project_metrics`, and `analytics_state` tables. Scans the entire Event Store to extract all active dates and project boundaries, then runs the daily/project aggregation engines.
2.  **Incremental Rebuild**: Triggers `.rebuildIncremental()`. Reads the last processed timestamp from `analytics_state` and scans only events recorded *after* that timestamp. This minimizes performance impact and avoids unnecessary database reads.
3.  **Fault Isolation**: If a single event fails serialization or envelope syntax validation, `RebuildManager` catches the error, increments `errorCount`, logs it, and continues. A single bad event will never halt the rebuild of other days.

---

## 9. Consistency Verification

The `ConsistencyChecker` verifies derived tables against raw event logs to flag any integrity degradation.

### 9.1. Invariant Rules Checked
*   **Tasks Completed**: `COUNT(task.completed events) == daily_metrics.tasksCompleted`
*   **Tasks Created**: `COUNT(task.created events) == daily_metrics.tasksCreated`
*   **Vault Uploads**: `COUNT(vault.file.uploaded) == daily_metrics.filesUploaded`
*   **Searches**: `COUNT(search.executed) == daily_metrics.searches`
*   **Focus Sessions**: `SUM(session.ended.duration) == daily_metrics.sessionDuration`
*   **Project Completion Rate**: Tasks Completed / Tasks Created (extracted directly from events matching the project ID) matches column values in `project_metrics`.

Any mismatches produce a structured report containing the mismatch check type, the key identifier (date/project), expected values, and actual values.

---

## 10. Operational Diagnostics & Validation

The diagnostics module exposes internal metrics to keep operations healthy.

### 10.1. Validator Rules (`AnalyticsValidator`)
*   **Orphaned Records**: Finds project metrics without matching database event records.
*   **Date Format Checks**: Asserts all daily metric keys conform to `YYYY-MM-DD`.
*   **Negative Values**: Asserts counters like `tasksCompleted` or `sessionDuration` are never negative.
*   **Completion Bounds**: Asserts `completionRate` in project tables is strictly between `0.0` and `1.0`.
*   **DTO Verification**: Performs structural verification on compiled `DashboardDTO` objects.

### 10.2. Diagnostics API (`DiagnosticsService`)
Provides endpoints for monitoring:
*   `getAnalyticsHealth()`: Returns health status (`HEALTHY` | `DEGRADED` | `UNHEALTHY`). Status becomes `UNHEALTHY` if database schemas fail checks, and `DEGRADED` if metric inconsistencies are flagged.
*   `getRebuildStatus()`: Returns the metadata fields from the latest run.
*   `getConsistencyReport()`: Exposes detail lists of mismatches.

---

## 11. Performance Benchmarking

Scale performance is validated regularly using the `BenchmarkRunner` to ensure linear scalability ($O(N)$):

| Event Volume | Rebuild Duration | Throughput (evt/sec) | Memory Delta | Dashboard Latency |
|--------------|------------------|----------------------|--------------|-------------------|
| 1,000        | ~5ms             | ~200,000             | <1 MB        | <1ms              |
| 10,000       | ~35ms            | ~285,000             | <2 MB        | <1ms              |
| 50,000       | ~180ms           | ~277,000             | <4 MB        | <2ms              |
| 100,000      | ~360ms           | ~277,000             | <8 MB        | <3ms              |

Throughput scales linearly with event count, maintaining stable sub-millisecond query responses due to query cache optimization.

