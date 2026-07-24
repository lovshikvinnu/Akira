# AKIRA OS Event & Instrumentation Subsystem

This document explains the architecture, design, and integration guidelines for AKIRA's **Event & Instrumentation Subsystem**.

---

## 1. System Overview

AKIRA OS implements a full-stack, local-first event-driven architecture. The subsystem acts as the platform's central nervous system, capturing all key business transitions as immutable factual events. This decouples the timeline, analytics, and intelligent companion (GENESIS) loops from the business services.

```
       [ Business Module ]
                │
                ▼ (publish)
        [ Publisher API ] (typeof window !== "undefined" ? Bridge RPC : Sync)
                │
                ▼ (executes)
     [ Middleware Pipeline ] (Injects ID, Timestamp, Correlation ID)
                │
                ▼ (broadcasts)
          [ Event Bus ]
                │
         ┌──────┴───────────────┐
         ▼                      ▼
[ Persistence Subscriber ]  [ Timeline Subscriber ]
         │                      │
         ▼                      ▼
  [ Event Store DB ]     [ Timeline DB Table ]
```

---

## 2. Event Model Specification

All events must conform to the `AkiraEvent` interface contract defined in `src/instrumentation/event-types.ts`:

- **`id`**: Unique UUID string identifier.
- **`type`**: String dot-notation namespace (e.g. `project.created`).
- **`timestamp`**: UTC ISO 8601 string representation.
- **`source`**: The module origin identifier (e.g. `projects-store`).
- **`entityId`** *(optional)*: The target resource ID (e.g. `proj-123`).
- **`actor`** *(optional)*: The execution context agent (e.g. `system`).
- **`correlationId`** *(optional)*: Tracking ID representing a unified workflow.
- **`payload`**: JSON-serializable structured object.
- **`metadata`** *(optional)*: Arbitrary execution trace key-values.
- **`version`**: Numeric schema version.

---

## 3. Middleware Processing Pipeline

When `publish()` is called, the raw `EventInput` is passed through a composable functional pipeline:

1. **`eventIdGenerator`**: Autogenerates a UUID if missing.
2. **`timestampInjector`**: Injects `new Date().toISOString()` if missing.
3. **`correlationIdGenerator`**: Injects a transaction trace UUID if missing.
4. **`serializationValidator`**: Performs deep recursion checks, rejecting circular payload references, functions, BigInts, Symbols, Maps, Sets, and custom classes.
5. **`validator`**: Enforces strict structural layouts and datatype types.

---

## 4. SQLite Event Store

All validated events are written to the `events` table by the `PersistenceSubscriber`.
The table schema is **append-only** and **immutable**:

- Events cannot be deleted or modified.
- High-performance query indexes cover: `timestamp`, `type`, `source`, `entity_id`, and `correlation_id` to power future replay, analytics, and companion memory recalls.

---

## 5. Timeline Subscriber Mapping Strategy

The `TimelineSubscriber` maps supported event streams into the user-visible Timeline database table, keeping payloads lightweight:

| Event Type | Source | Mapped Timeline Context |
| :--- | :--- | :--- |
| `project.created` | `projects-store` | Created Project |
| `project.updated` | `projects-store` | Updated Project |
| `project.deleted` | `projects-store` | Deleted Project |
| `task.created` | `tasks-store` | Created Task |
| `task.completed` | `tasks-store` | Completed Task |
| `task.reopened` | `tasks-store` | Reopened Task |
| `task.deleted` | `tasks-store` | Deleted Task |
| `note.created` | `notes-store` | Created Note |
| `note.updated` | `notes-store` | Updated Note |
| `note.deleted` | `notes-store` | Deleted Note |
| `session.started` | `sessions-store` | Started Work Session |
| `session.ended` | `sessions-store` | Completed Work Session |
| `vault.file.uploaded` | `vault-service` | Uploaded File |
| `vault.file.deleted` | `vault-service` | Deleted File |

---

## 6. Reliability & Ordering Guarantees

### Chronological Sequencing
The Event Bus processes event publications synchronously per invocation. Events are delivered and written sequentially to the SQLite database and Timeline tables in the exact order they are published, preventing out-of-order race conditions.

### Uniqueness and Idempotency
Double-publishing an event (e.g. resending the same event ID) triggers a primary key constraint failure in SQLite. The transaction is rolled back safely, ensuring exactly-once delivery and preventing duplicate user timeline updates.

### Fault Isolation Strategy
If a subscriber throws a synchronous exception or returns a rejected Promise, the Event Bus catches the error and continues to broadcast to other subscribers. A failure in database insertion, for instance, does not block the Timeline Subscriber from updating the UI, nor does it crash the parent thread.

---

## 7. Performance Benchmarks

High-volume benchmarks performed against SQLite in WAL journal mode verify low latency and high throughput.

| Event Count | Total Time (ms) | Throughput (events/sec) | Avg Latency (ms) | p95 Latency (ms) | Memory Growth |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1,000** | 43.9 | 22,793.3 | 0.0435 | 0.0756 | 1.16 MB |
| **10,000** | 469.8 | 21,286.0 | 0.0468 | 0.0840 | 0.02 MB |
| **50,000** | 2701.0 | 18,511.5 | 0.0539 | 0.1194 | 1.35 MB |

---

## 8. Static Architecture Rules

AKIRA's architecture validator enforces the following constraints:
1. **API Encapsulation**: Business modules must use the public `publish()` API. Direct writes to `timeline_events` or `events` tables from outside repositories are blocked.
2. **Event Bus Separation**: Direct imports of `src/instrumentation/event-bus` outside the `src/instrumentation/` directory are prohibited. Modules must import the event bus from the root index.
3. **Repository Boundaries**: The public publisher API must never import persistence layers (`better-sqlite3`, repositories) directly, preserving clean client bundles.
4. **Subscriber Interface**: Every event observer must implement the `EventSubscriber` interface contract.
5. **Append-Only Store**: The event repository must remain strictly append-only (no `delete`, `update`, or data truncation functions).

---

## 9. Extension Guidelines

To register a new subscriber (e.g., for Analytics, GENESIS, or TITAN):
1. Create a class implementing the `EventSubscriber` interface.
2. Define a unique string ID and implement the async `onEvent(event: AkiraEvent): Promise<void>` handler.
3. Register the subscriber on the Event Bus:
   ```typescript
   import { globalEventBus } from "src/instrumentation";
   globalEventBus.subscribe(new YourSubscriber());
   ```
4. Do not block inside `onEvent`. If performing heavy or long-running work, offload execution to a separate worker thread or defer execution.
