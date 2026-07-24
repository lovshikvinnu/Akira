# Module: Projects Management

The Projects module manages custom client-side projects, tracking timelines, completion progress, color indicators, active next tasks, and workspace associations.

---

## 1. Overview & Responsibilities

The Projects subsystem is responsible for:
1.  **Project Organization**: Grouping tasks, focus sessions, and files under parent project directories.
2.  **Progress Tracking**: Computing completion metrics based on completed tasks.
3.  **Visual Customization**: Storing color indicators, icon parameters, description tags, and text details.
4.  **Touch Tracking**: Logging the last worked timestamps when tasks or sessions are updated.

---

## 2. Directory Structure

```
src/akira-os/projects/
└── index.ts             # Projects client service and RPC server functions
```

---

## 3. Database Schema

Projects data is persisted in the `projects` table:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  description TEXT,
  progress INTEGER DEFAULT 0,
  color TEXT NOT NULL,
  next_task TEXT,
  notes TEXT,
  time_spent_minutes INTEGER DEFAULT 0,
  last_worked TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  icon TEXT NOT NULL,
  CHECK (progress >= 0 AND progress <= 100),
  CHECK (time_spent_minutes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);
```

---

## 4. UI Presentation

*   **Routes**: `/projects` (`src/routes/projects.tsx`) and `/projects/$id` (`src/routes/projects.$id.tsx`).
*   **Layout Mode**: Uses `scroll` layout mode for the projects list and detail pages.
*   **Visual Style**: Uses dynamic card lists showing progress bars, matching color schemes, task completion indicators, and direct links to active focus sessions.

---

## 5. Known Limitations & Future Work

*   **Static Calculations**: Progress percentages must be updated manually or calculated during specific task mutations.
*   **Planned Improvement**: Creating a database trigger to calculate progress percentages dynamically whenever a task's `done` status is toggled.
