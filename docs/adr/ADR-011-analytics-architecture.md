# ADR-011: Analytics Architecture

## Status
Proposed / Accepted

## Context
As AKIRA OS evolves into a self-improving personal companion, we need to introduce a subsystem that derives insights, productivity metrics, and user activity summaries. However, building analytics directly inside business modules (Tasks, Projects, Notes) leads to heavy coupling, code bloat, database lock contention, and violation of the single-responsibility principle. 

We need a dedicated, decoupled Analytics subsystem that:
1. Operates on a pure read-only basis relative to the main application states.
2. derives all its data exclusively by consuming the immutable Event Store.
3. Decouples metrics calculations from database persistence.
4. Exposes an extensible metric calculation framework to allow easy addition of new metrics in the future.

## Decision
We enforce the following architectural patterns and constraints for the Analytics subsystem:

### 1. Module Isolation and Boundaries
- The Analytics subsystem is located under `src/analytics/` with a strictly defined directory structure.
- **Read-Only / No Mutate**: Analytics must never update or delete logs in the Event Store. It consumes the append-only event log as its source of truth.
- **No Business Coupling**: Analytics does not import or call services in business modules. It must only depend on instrumentation event payloads and types.
- **Dedicated Persistence**: Derived aggregates are saved in separate derived tables (`daily_metrics`, `project_metrics`) managed by an `AnalyticsRepository` backed by SQLite.

### 2. Event Store Dependency
- The subsystem retrieves events using `EventRepository.findBetween()`.
- Real-time updates are driven via an `AnalyticsSubscriber` which hooks into the `EventBus` asynchronously (using short timeouts) to avoid stalling key user interactions.

### 3. Metric Calculator Framework
We implement an extensible, plugin-like metric interface:
- Each metric calculator implements the `MetricCalculator` contract, declaring:
  - `name`: a unique string identifier.
  - `supportedEventTypes`: an array of event type strings it wants to observe.
  - `processEvent(event: AkiraEvent)`: updates internal calculator state.
  - `calculate()`: outputs the compiled summary.
  - `reset()`: resets the internal calculator state.
- The `AnalyticsEngine` acts as an orchestrator that coordinates the collection of events, feeds them to the registered calculators, and passes the output to the repository layer.

### 4. Derived Data Model Schema
We create the following tables in SQLite to house compiled metrics:
- **`daily_metrics`**:
  - `date` TEXT PRIMARY KEY (format: YYYY-MM-DD)
  - `tasks_completed` INTEGER DEFAULT 0
  - `tasks_created` INTEGER DEFAULT 0
  - `notes_created` INTEGER DEFAULT 0
  - `files_uploaded` INTEGER DEFAULT 0
  - `searches` INTEGER DEFAULT 0
  - `session_duration` INTEGER DEFAULT 0 (total productive focus time in seconds)
  - `active_projects` INTEGER DEFAULT 0 (distinct count of projects interacted with)
- **`project_metrics`**:
  - `project_id` TEXT PRIMARY KEY
  - `activity_score` REAL DEFAULT 0.0 (events volume associated with the project)
  - `completion_rate` REAL DEFAULT 0.0 (tasks completed / tasks created ratio)
  - `last_activity` TEXT (ISO timestamp of the most recent project event)

### 5. Aggregation Pipeline & Scheduler
- **Daily Aggregation**: Reads events between UTC boundaries for a target day (`00:00:00.000Z` to `23:59:59.999Z`), runs them through registered daily calculators, and saves/upserts the daily row.
- **Project Aggregation**: Gathers historical events associated with a project ID, calculates metrics, and updates the project row.
- **Full Aggregation**: Scans all history to identify all active dates and project IDs, executing daily and project aggregation pipelines sequentially.
- **Background Scheduler**: A simple, timer-based scheduler utilizing standard node `setInterval` runs full calculations periodically.

## Consequences
- **Extensibility**: Developers can register new metric calculators with `registerCalculator()` to derive new analytics metrics without altering engine internals or existing schemas.
- **Performance**: Isolating analytics writes to specific derived tables prevents write-amplification on event tables and reduces index overheads on transactional database operations.
- **Resilience**: Because the engine runs asynchronously and handles database writes inside transactions, any analytical processing failures are isolated and will not block core application functionalities.
