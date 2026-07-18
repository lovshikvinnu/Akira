// Client-side prevention guard
if (typeof window !== "undefined") {
  throw new Error("persistence/initializer.ts must only be loaded on the server side.");
}

import fs from "fs";
import path from "path";
import { getDatabaseConnection } from "./connection";

/**
 * Bootstraps the SQLite database.
 * If the database tables are not initialized, it reads and runs schema.sql,
 * then records version 1 in the schema_version table.
 */
export const initializeDatabase = (): void => {
  const db = getDatabaseConnection();

  // Validate database tables by checking for schema_version
  const tableCheck = db
    .prepare(
      `
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='schema_version'
  `,
    )
    .get();

  if (!tableCheck) {
    // Database schema does not exist, run bootstrap schema DDL
    const schemaPath = path.join(process.cwd(), "src", "persistence", "schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Critical: SQLite schema DDL not found at ${schemaPath}`);
    }

    const ddlContent = fs.readFileSync(schemaPath, "utf8");

    // Execute DDL within an explicit transaction to ensure atomicity
    db.transaction(() => {
      db.exec(ddlContent);

      // Seed the initial database version 1
      const versionStmt = db.prepare(`
        INSERT INTO schema_version (version, applied_at)
        VALUES (?, ?)
      `);
      versionStmt.run(1, new Date().toISOString());
    })();

    console.log("SQLite Database initialized successfully with schema version 1.");
  } else {
    console.log("SQLite Database connection verified. Schema is already present.");
  }

  // Dynamic Migration: Ensure timeline_events table is created if it does not exist
  const timelineTableCheck = db
    .prepare(
      `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='timeline_events'
    `,
    )
    .get();

  if (!timelineTableCheck) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS timeline_events (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          project_id TEXT,
          payload TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          payload_version INTEGER DEFAULT 1,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_timeline_project_event ON timeline_events (project_id, event_type);
      `);
    })();
    console.log("SQLite Database migration completed: timeline_events table created.");
  }

  // Dynamic Migration: Ensure search_history and fts_workspace tables and triggers are created if they do not exist
  const searchHistoryCheck = db
    .prepare(
      `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='search_history'
    `,
    )
    .get();

  if (!searchHistoryCheck) {
    db.transaction(() => {
      db.exec(`
        -- Search History Table
        CREATE TABLE IF NOT EXISTS search_history (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL UNIQUE ON CONFLICT REPLACE,
          searched_at TEXT NOT NULL,
          result_count INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history (searched_at DESC);

        -- FTS5 Search Index Table
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
      `);
    })();
    console.log("SQLite Database migration completed: search_history & fts_workspace created.");
  }
};
