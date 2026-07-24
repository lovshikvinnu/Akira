# ADR-013: Analytics Query Layer

## Status
Proposed / Accepted

## Context
With all core metric calculators, repositories, timezone bounds, and background engines implemented in v1.6 (Sprint 1.1 & 1.2), we need to expose the analytics data to external systems. These systems include the future Dashboard UI, internal productivity monitors, and the upcoming AI-driven reasoning subsystem (GENESIS). To prevent coupling, database locking issues, and leakage of SQL details, we need a query and service interface that enforces read-only layering, type safety, and strict decoupling from SQLite.

## Decision
We enforce the following architectural patterns for the Analytics Query Layer:

### 1. Two-Tier Service Layer Boundary
- **AnalyticsService**: The public gateway facade. It validates parameter options, resolves relative date ranges, handles timezone offsets, and maps response payloads.
- **QueryService**: The internal query executer. It alone has access to the repositories (`EventRepository` and `AnalyticsRepository`). It performs optimal event filtering (applying `projectId`, `eventType`, and `module` filter criteria) and executes calculators to return structured results.
- **Strict Layering**: Business modules and UI components are strictly forbidden from executing SQL queries or reading repositories directly. They must go through `AnalyticsService`.

### 2. DTO Isolation (Stable Response Contracts)
- Every public API endpoint in `AnalyticsService` returns a strongly typed DTO (e.g. `DashboardSummaryDTO`, `ProductivitySummaryDTO`, `ProjectHealthDTO`).
- These DTOs isolate internal sqlite schema definitions and intermediate calculation results, keeping public interfaces clean and stable.
- If a query retrieves no events (empty history), the service layer returns a default zeroed DTO object (e.g. `tasksCompleted: 0`, `completionRate: 0.0`) rather than returning `null`. This prevents downstream null-pointer exceptions in UIs and client modules.

### 3. Centralized Validation and Predefined Ranges
- Predefined ranges (`today`, `yesterday`, `last7Days`, `last30Days`) are resolved to precise ISO 8601 UTC date bounds by adjusting local midnight boundaries according to the user's localized timezone offset.
- Centralized validation in `validateAndResolveQuery` rejects invalid dates, malformed filters, and cases where `endDate` precedes `startDate` prior to query execution.

## Consequences
- **Decoupling**: Future database migrations (e.g., transitioning from SQLite to another database) will have zero impact on dashboard UIs or internal consumers because the DTO contracts are fully stable.
- **AI Integration**: The upcoming GENESIS AI agent will be able to consume the high-level `AnalyticsService` APIs to derive insights without parsing raw SQL logs.
- **Performance & Caching**: The two-tier architecture allows us to introduce a memory-caching layer inside `QueryService` at a later stage without modifying the public endpoints of `AnalyticsService`.
