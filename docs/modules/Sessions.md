# Module: Focus Sessions Tracking

The Sessions module handles focus tracking sessions, logging started/ended timestamps, active tasks, session durations, and project links.

---

## 1. Overview & Responsibilities

The Sessions subsystem is responsible for:
1.  **Session Lifecycle**: Tracking focus starts, task changes, and session closures.
2.  **Duration Calculation**: Computing active working minutes between bounds.
3.  **Task Connection**: Storing active task titles to provide context for focus logs.
4.  **Project Attribution**: Connecting focus time back to parent projects to track progress.

---

## 2. Directory Structure

```
src/akira-os/sessions/
└── index.ts             # Focus tracking client service and RPC server functions
```

---

## 3. Database Schema

Sessions are stored in the `sessions` table:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration INTEGER NOT NULL,              -- Duration in minutes
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (duration >= 0),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions (project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);
```

---

## 4. UI Presentation

*   **Route**: `/sessions` (`src/routes/sessions.tsx`).
*   **Layout Mode**: Uses `scroll` layout mode to render focus logs.
*   **Visual Style**: Renders active focus countdown panels, session logs, total focus statistics, and interactive edit forms.

---

## 5. Known Limitations & Future Work

*   **No Auto-Pausing**: Timers run continuously until manually stopped.
*   **Planned Improvement**: Implementing idle detection to auto-pause sessions if no mouse or keyboard events are detected for 10 minutes.
