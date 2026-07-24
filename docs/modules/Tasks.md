# Module: Daily Tasks & Missions

The Tasks module manages focus tasks, prioritizes daily objectives, tracks completion states, and connects tasks to parent projects.

---

## 1. Overview & Responsibilities

The Tasks subsystem is responsible for:
1.  **Task Creation & CRUD**: Tracking task details (titles, descriptions, priorities, and durations).
2.  **State Management**: Toggling done and completed states (represented as binary integers).
3.  **Priority Tagging**: Categorizing items under priority headers ('Low', 'Medium', 'High').
4.  **Due Date Scheduling**: Storing ISO date strings for daily mission sorting.

---

## 2. Directory Structure

```
src/akira-os/tasks/
└── index.ts             # Tasks client service and RPC server functions
```

---

## 3. Database Schema

Tasks are stored in the `tasks` table with foreign keys linking to projects:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL,
  estimated_duration INTEGER DEFAULT 0,
  due_date TEXT,
  done INTEGER DEFAULT 0,                 -- Boolean represented as 0 or 1
  completed INTEGER DEFAULT 0,            -- Boolean represented as 0 or 1
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (priority IN ('Low', 'Medium', 'High')),
  CHECK (done IN (0, 1)),
  CHECK (completed IN (0, 1)),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
```

---

## 4. UI Presentation

*   **Route**: `/tasks` (`src/routes/tasks.tsx`) and `/daily-mission` (`src/routes/daily-mission.tsx`).
*   **Layout Mode**: Uses `scroll` layout mode for standard list rendering.
*   **Visual Style**: Tasks are grouped under priority and completion headers. The page includes interactive checkboxes, quick-add inputs, duration estimation icons, and project connection dropdowns.

---

## 5. Known Limitations & Future Work

*   **No Recurring Tasks**: Tasks are one-off items. Repeating habits must be managed separately.
*   **Planned Improvement**: Supporting task templates and automatically generating daily tasks for active routines.
