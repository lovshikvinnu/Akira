-- Migration: 002_file_vault.sql
-- Goal: Create all File Vault database structures (tables, indexes, triggers) for Sprint 1.1

-- ==========================================
-- File Vault Tables
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

-- ==========================================
-- Indexes
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_vault_files_hash ON vault_files (hash);
CREATE INDEX IF NOT EXISTS idx_vault_files_folder_id ON vault_files (folder_id);
CREATE INDEX IF NOT EXISTS idx_vault_files_created_at ON vault_files (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_files_updated_at ON vault_files (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_files_deleted_at ON vault_files (deleted_at);
CREATE INDEX IF NOT EXISTS idx_vault_files_favorite ON vault_files (favorite);
CREATE INDEX IF NOT EXISTS idx_vault_files_mime_type ON vault_files (mime_type);
CREATE INDEX IF NOT EXISTS idx_vault_folders_parent_id ON vault_folders (parent_id);

-- ==========================================
-- Triggers
-- ==========================================

-- Trigger: Folder timestamp updates
CREATE TRIGGER IF NOT EXISTS trg_vault_folders_updated_at 
AFTER UPDATE ON vault_folders
BEGIN
  UPDATE vault_folders 
  SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = new.id AND updated_at = old.updated_at;
END;

-- Trigger: File timestamp updates
CREATE TRIGGER IF NOT EXISTS trg_vault_files_updated_at 
AFTER UPDATE ON vault_files
BEGIN
  UPDATE vault_files 
  SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = new.id AND updated_at = old.updated_at;
END;

-- Trigger: Tag Garbage Collection
CREATE TRIGGER IF NOT EXISTS trg_vault_file_tags_cleanup 
AFTER DELETE ON vault_file_tags
BEGIN
  DELETE FROM vault_tags
  WHERE id = old.tag_id AND NOT EXISTS (
    SELECT 1 FROM vault_file_tags WHERE tag_id = old.tag_id
  );
END;

-- Triggers: Polymorphic Cleanup
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

-- Triggers: Timeline Logs Auditing
CREATE TRIGGER IF NOT EXISTS trg_vault_files_insert_audit 
AFTER INSERT ON vault_files
BEGIN
  INSERT INTO timeline_events (id, event_type, project_id, payload, timestamp, payload_version)
  VALUES (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    'file.created',
    NULL,
    json_object('id', new.id, 'displayName', new.display_name, 'sizeBytes', new.size_bytes, 'mimeType', new.mime_type),
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
    1
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_vault_files_delete_audit 
AFTER DELETE ON vault_files
BEGIN
  INSERT INTO timeline_events (id, event_type, project_id, payload, timestamp, payload_version)
  VALUES (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    'file.deleted',
    NULL,
    json_object('id', old.id, 'displayName', old.display_name, 'hash', old.hash),
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
    1
  );
END;
