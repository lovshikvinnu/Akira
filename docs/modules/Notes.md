# Module: Notes & Brain Dump

The Notes module manages quick ideas, pinned items, favorite listings, tag categorizations, and markdown-like logs.

---

## 1. Overview & Responsibilities

The Notes subsystem is responsible for:
1.  **Idea Capture**: Providing forms to capture user ideas.
2.  **State Flags**: Managing pinned and favorite status tags to support custom filtering.
3.  **Relational Context**: Grouping notes under parent projects using project identifiers.
4.  **Tag Array Serialization**: Converting array tags into JSON strings for database compatibility.

---

## 2. Directory Structure

```
src/akira-os/notes/
└── index.ts             # Notes client service and RPC server functions
```

---

## 3. Database Schema

Notes data is stored in the `notes` table:

```sql
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,                              -- JSON-serialized array of strings
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pinned INTEGER DEFAULT 0,               -- Boolean represented as 0 or 1
  favorite INTEGER DEFAULT 0,            -- Boolean represented as 0 or 1
  project_id TEXT,
  CHECK (pinned IN (0, 1)),
  CHECK (favorite IN (0, 1)),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes (project_id);
CREATE INDEX IF NOT EXISTS idx_notes_pinned_favorite ON notes (pinned, favorite);
```

---

## 4. UI Presentation

*   **Route**: `/notes` (`src/routes/notes.tsx`) and `/brain-dump` (`src/routes/brain-dump.tsx`).
*   **Layout Mode**: Uses `scroll` layout mode to support long content layouts.
*   **Visual Style**: Renders clean glassmorphic note cards. Pinned notes stay at the top of the feed. The page features sidebar tag listings, project grouping options, and quick-search input forms.

---

## 5. Known Limitations & Future Work

*   **No Rich WYSIWYG Editing**: Notes currently use plain textareas.
*   **Planned Improvement**: Supporting rich text rendering and editor toolbars.
