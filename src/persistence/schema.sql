-- SQLite Database Schema for AKIRA OS v1.1
-- Primary key strategy: UUID values populated before persistence.

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
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL,
  estimated_duration INTEGER DEFAULT 0,
  due_date TEXT,
  done INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (priority IN ('Low', 'Medium', 'High')),
  CHECK (done IN (0, 1)),
  CHECK (completed IN (0, 1)),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done_completed ON tasks (done, completed);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks (updated_at DESC);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT, -- JSON-serialized array of tags
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pinned INTEGER DEFAULT 0,
  favorite INTEGER DEFAULT 0,
  project_id TEXT,
  CHECK (pinned IN (0, 1)),
  CHECK (favorite IN (0, 1)),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes (project_id);
CREATE INDEX IF NOT EXISTS idx_notes_pinned_favorite ON notes (pinned, favorite);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (duration >= 0),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions (project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL, -- JSON-serialized value
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_history (
  migration_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);
