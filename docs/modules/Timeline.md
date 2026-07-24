# Module: Timeline Logs

The Timeline module records and lists chronological logs of user activities and system actions across AKIRA OS.

---

## 1. Overview & Responsibilities

The Timeline subsystem is responsible for:
1.  **Event Listening**: Subscribing to domain events published via the global `eventBus` (e.g. projects, tasks, notes, vault files).
2.  **Entity Capture**: Snapshotting the parameters and payloads of events (such as project details or task completion status) at the moment they occur.
3.  **Relational Mapping**: Linking events to relevant projects via the `project_id` foreign key.
4.  **Chronological Presentation**: Providing pagination queries to display logs on the dashboard.

---

## 2. Directory Structure

```
src/akira-os/timeline/
├── index.ts             # Export barrel
├── service.ts           # TimelineService (listens to eventBus and dispatches database writes)
├── types.ts             # TimelineEvent interfaces and Query parameter types
└── timeline.test.ts     # Event mapping and search query tests
```

---

## 3. Timeline Service & Event Subscriptions

On application boot, `TimelineService` subscribes to system events:

```typescript
// Location: src/akira-os/timeline/service.ts
const domainEvents = [
  Events.PROJECT_CREATED,
  Events.TASK_COMPLETED,
  Events.NOTE_CREATED,
  Events.VAULT_FILE_UPLOADED
];

domainEvents.forEach((eventName) => {
  eventBus.subscribe(eventName, (event) => {
    this.handleDomainEvent(event.type, event.payload, event.timestamp);
  });
});
```

*   **Payload Serialization**: Payloads are stored as JSON strings in the database.
*   **Decoupled Repository Imports**: To prevent database driver leakage to the browser, the service uses dynamic imports:
    ```typescript
    const { timelineRepository } = await import("../../persistence/repositories");
    ```

---

## 4. SQLite Schema & Triggers

Timeline logs are persisted inside the `timeline_events` table:

```sql
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  project_id TEXT,
  payload TEXT NOT NULL,                  -- JSON stringified snapshot
  timestamp TEXT NOT NULL,
  payload_version INTEGER DEFAULT 1,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events (timestamp DESC);
```

---

## 5. UI Presentation

*   **Route**: `/timeline` (`src/routes/timeline.tsx`).
*   **Layout Mode**: Uses `scroll` mode to allow infinite scrolling of logs.
*   **Visual Style**: Events are rendered on a vertical line. Icons differentiate event categories (e.g., green checkmarks for completed tasks, rocket icons for projects, folder icons for files).

---

## 6. Known Limitations & Future Work

*   **No Auto-Pruning**: The `timeline_events` table grows indefinitely.
*   **Planned Improvement**: Implementing a background pruning job in the *TITAN Subsystem* to compress or archive logs older than 90 days.
