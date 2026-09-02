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

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  project_id TEXT,
  payload TEXT NOT NULL, -- JSON stringified metadata
  timestamp TEXT NOT NULL,
  payload_version INTEGER DEFAULT 1,
  -- Monotonic record order. `timestamp` only has millisecond resolution, so a
  -- burst recorded inside one millisecond ties; (timestamp, seq) is the total
  -- order the Timeline sorts and paginates by.
  seq INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_seq ON timeline_events (seq);
CREATE INDEX IF NOT EXISTS idx_timeline_timestamp_seq ON timeline_events (timestamp DESC, seq DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_project_event ON timeline_events (project_id, event_type);

-- Search History and FTS5 Virtual Table for Universal Search
CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL UNIQUE ON CONFLICT REPLACE,
  searched_at TEXT NOT NULL,
  result_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history (searched_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_workspace USING fts5(
  entity_id,
  entity_type,
  title,
  content,
  updated_at UNINDEXED,
  tokenize = 'porter unicode61'
);

-- Triggers for projects
CREATE TRIGGER IF NOT EXISTS trg_projects_insert AFTER INSERT ON projects BEGIN
  INSERT INTO fts_workspace(entity_id, entity_type, title, content, updated_at)
  VALUES (new.id, 'project', new.name, new.tag || ' ' || COALESCE(new.description, ''), new.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_update AFTER UPDATE ON projects BEGIN
  UPDATE fts_workspace
  SET title = new.name,
      content = new.tag || ' ' || COALESCE(new.description, ''),
      updated_at = new.updated_at
  WHERE entity_id = new.id AND entity_type = 'project';
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_delete AFTER DELETE ON projects BEGIN
  DELETE FROM fts_workspace WHERE entity_id = old.id AND entity_type = 'project';
  DELETE FROM fts_workspace WHERE entity_type = 'session' AND entity_id IN (SELECT id FROM sessions WHERE project_id = old.id);
END;

-- Triggers for tasks
CREATE TRIGGER IF NOT EXISTS trg_tasks_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO fts_workspace(entity_id, entity_type, title, content, updated_at)
  VALUES (new.id, 'task', new.title, COALESCE(new.description, ''), new.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_update AFTER UPDATE ON tasks BEGIN
  UPDATE fts_workspace
  SET title = new.title,
      content = COALESCE(new.description, ''),
      updated_at = new.updated_at
  WHERE entity_id = new.id AND entity_type = 'task';
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_delete AFTER DELETE ON tasks BEGIN
  DELETE FROM fts_workspace WHERE entity_id = old.id AND entity_type = 'task';
END;

-- Triggers for notes
CREATE TRIGGER IF NOT EXISTS trg_notes_insert AFTER INSERT ON notes BEGIN
  INSERT INTO fts_workspace(entity_id, entity_type, title, content, updated_at)
  VALUES (
    new.id,
    'note',
    new.title,
    new.content || ' ' || replace(replace(replace(replace(COALESCE(new.tags, ''), '[', ''), ']', ''), '"', ''), ',', ' '),
    new.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_update AFTER UPDATE ON notes BEGIN
  UPDATE fts_workspace
  SET title = new.title,
      content = new.content || ' ' || replace(replace(replace(replace(COALESCE(new.tags, ''), '[', ''), ']', ''), '"', ''), ',', ' '),
      updated_at = new.updated_at
  WHERE entity_id = new.id AND entity_type = 'note';
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_delete AFTER DELETE ON notes BEGIN
  DELETE FROM fts_workspace WHERE entity_id = old.id AND entity_type = 'note';
END;

-- Triggers for sessions
CREATE TRIGGER IF NOT EXISTS trg_sessions_insert AFTER INSERT ON sessions BEGIN
  INSERT INTO fts_workspace(entity_id, entity_type, title, content, updated_at)
  VALUES (new.id, 'session', new.task, COALESCE(new.notes, ''), new.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_sessions_update AFTER UPDATE ON sessions BEGIN
  UPDATE fts_workspace
  SET title = new.task,
      content = COALESCE(new.notes, ''),
      updated_at = new.updated_at
  WHERE entity_id = new.id AND entity_type = 'session';
END;

CREATE TRIGGER IF NOT EXISTS trg_sessions_delete AFTER DELETE ON sessions BEGIN
  DELETE FROM fts_workspace WHERE entity_id = old.id AND entity_type = 'session';
END;

-- Triggers for timeline_events
CREATE TRIGGER IF NOT EXISTS trg_timeline_events_insert AFTER INSERT ON timeline_events BEGIN
  INSERT INTO fts_workspace(entity_id, entity_type, title, content, updated_at)
  VALUES (
    new.id,
    'timeline',
    new.event_type,
    COALESCE(json_extract(new.payload, '$.title'), json_extract(new.payload, '$.task'), json_extract(new.payload, '$.name'), ''),
    new.timestamp
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_timeline_events_update AFTER UPDATE ON timeline_events BEGIN
  UPDATE fts_workspace
  SET title = new.event_type,
      content = COALESCE(json_extract(new.payload, '$.title'), json_extract(new.payload, '$.task'), json_extract(new.payload, '$.name'), ''),
      updated_at = new.timestamp
  WHERE entity_id = new.id AND entity_type = 'timeline';
END;

CREATE TRIGGER IF NOT EXISTS trg_timeline_events_delete AFTER DELETE ON timeline_events BEGIN
  DELETE FROM fts_workspace WHERE entity_id = old.id AND entity_type = 'timeline';
END;

-- ==========================================
-- File Vault Tables, Indexes, and Triggers
-- ==========================================

-- Table: vault_folders
CREATE TABLE IF NOT EXISTS vault_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES vault_folders(id) ON DELETE CASCADE
);

-- Table: vault_files
CREATE TABLE IF NOT EXISTS vault_files (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  folder_id TEXT,
  status TEXT NOT NULL,
  favorite INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  last_opened_at TEXT,
  CHECK (favorite IN (0, 1)),
  CHECK (size_bytes >= 0),
  CHECK (status IN ('Uploading', 'Ready', 'Failed')),
  FOREIGN KEY (folder_id) REFERENCES vault_folders(id) ON DELETE SET NULL
);

-- Table: vault_tags
CREATE TABLE IF NOT EXISTS vault_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- Table: vault_file_tags
CREATE TABLE IF NOT EXISTS vault_file_tags (
  file_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (file_id, tag_id),
  FOREIGN KEY (file_id) REFERENCES vault_files(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES vault_tags(id) ON DELETE CASCADE
);

-- Table: vault_file_links
CREATE TABLE IF NOT EXISTS vault_file_links (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(file_id, entity_type, entity_id),
  CHECK (entity_type IN ('project', 'task', 'note', 'session')),
  FOREIGN KEY (file_id) REFERENCES vault_files(id) ON DELETE CASCADE
);

-- Indexes for Folder Browsing and Deduplication
CREATE INDEX IF NOT EXISTS idx_vault_files_hash ON vault_files (hash);
CREATE INDEX IF NOT EXISTS idx_vault_files_folder_id ON vault_files (folder_id);
CREATE INDEX IF NOT EXISTS idx_vault_files_created_at ON vault_files (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_files_updated_at ON vault_files (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_files_deleted_at ON vault_files (deleted_at);
CREATE INDEX IF NOT EXISTS idx_vault_files_favorite ON vault_files (favorite);
CREATE INDEX IF NOT EXISTS idx_vault_files_mime_type ON vault_files (mime_type);
CREATE INDEX IF NOT EXISTS idx_vault_folders_parent_id ON vault_folders (parent_id);

-- Triggers for folder timestamp updates
CREATE TRIGGER IF NOT EXISTS trg_vault_folders_updated_at 
AFTER UPDATE ON vault_folders
BEGIN
  UPDATE vault_folders 
  SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = new.id AND updated_at = old.updated_at;
END;

-- Triggers for file timestamp updates
CREATE TRIGGER IF NOT EXISTS trg_vault_files_updated_at 
AFTER UPDATE ON vault_files
BEGIN
  UPDATE vault_files 
  SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = new.id AND updated_at = old.updated_at;
END;

-- Trigger for Tag Garbage Collection (Tag cleanup when unused)
CREATE TRIGGER IF NOT EXISTS trg_vault_file_tags_cleanup 
AFTER DELETE ON vault_file_tags
BEGIN
  DELETE FROM vault_tags
  WHERE id = old.tag_id AND NOT EXISTS (
    SELECT 1 FROM vault_file_tags WHERE tag_id = old.tag_id
  );
END;

-- Triggers for Polymorphic Cleanup (Orphan links prevention)
CREATE TRIGGER IF NOT EXISTS trg_vault_links_cleanup_projects 
AFTER DELETE ON projects
BEGIN
  DELETE FROM vault_file_links WHERE entity_type = 'project' AND entity_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vault_links_cleanup_tasks 
AFTER DELETE ON tasks
BEGIN
  DELETE FROM vault_file_links WHERE entity_type = 'task' AND entity_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vault_links_cleanup_notes 
AFTER DELETE ON notes
BEGIN
  DELETE FROM vault_file_links WHERE entity_type = 'note' AND entity_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vault_links_cleanup_sessions 
AFTER DELETE ON sessions
BEGIN
  DELETE FROM vault_file_links WHERE entity_type = 'session' AND entity_id = old.id;
END;

-- Triggers for Audit/Timeline Logging
CREATE TRIGGER IF NOT EXISTS trg_vault_files_insert_audit 
AFTER INSERT ON vault_files
BEGIN
  INSERT INTO timeline_events (id, event_type, project_id, payload, timestamp, payload_version, seq)
  VALUES (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    'file.created',
    NULL,
    json_object('id', new.id, 'displayName', new.display_name, 'sizeBytes', new.size_bytes, 'mimeType', new.mime_type),
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
    1,
    (SELECT IFNULL(MAX(seq), 0) + 1 FROM timeline_events)
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_vault_files_delete_audit 
AFTER DELETE ON vault_files
BEGIN
  INSERT INTO timeline_events (id, event_type, project_id, payload, timestamp, payload_version, seq)
  VALUES (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    'file.deleted',
    NULL,
    json_object('id', old.id, 'displayName', old.display_name, 'hash', old.hash),
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
    1,
    (SELECT IFNULL(MAX(seq), 0) + 1 FROM timeline_events)
  );
END;


