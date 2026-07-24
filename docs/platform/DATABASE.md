# Platform Subsystem: SQLite Database & Repositories

AKIRA OS uses a local SQLite database for data storage and indexing. This document explains the database configuration, schema tables, database triggers, migrations, and file organization.

---

## 1. Database Connection & Pragma Configurations

The database connection is managed via `better-sqlite3` in `src/persistence/connection.ts`. To ensure parallel performance and referential integrity, the system applies the following configurations upon initialization:

*   **WAL Mode (`journal_mode = WAL`)**: Writes changes to a write-ahead log file, allowing parallel reads and writes.
*   **Foreign Keys (`foreign_keys = ON`)**: Enforces validation constraints and cascading deletes across linked tables.
*   **Busy Timeout (`busy_timeout = 5000`)**: Prevents file locks from crashing queries, pausing write operations for up to 5 seconds.
*   **Auto Vacuum (`auto_vacuum = INCREMENTAL`)**: Reduces file sizes on disk when data is removed.

---

## 2. Table Layouts & Indexes

```
  ┌────────────────────────────────────────────────────────┐
  │                        projects                        │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ├─────────────────────────────┐
                             ▼                             ▼
              ┌─────────────────────────────┐┌─────────────────────────────┐
              │            tasks            ││            notes            │
              └─────────────────────────────┘└─────────────────────────────┘
```

*   **Projects Table (`projects`)**: Uses index trees on `created_at` and `updated_at`.
*   **Tasks Table (`tasks`)**: Linked to projects via foreign keys with `ON DELETE SET NULL` constraints.
*   **Notes Table (`notes`)**: Stores metadata tags as JSON-serialized arrays.
*   **Sessions Table (`sessions`)**: Tracks focus duration times linked to projects with `ON DELETE CASCADE` constraints.

---

## 3. Universal Full-Text Search (FTS5) & Triggers

To support fast universal search, SQLite uses an `fts_workspace` virtual table with the `porter unicode61` tokenizer:

*   **FTS5 Schema**:
    ```sql
    CREATE VIRTUAL TABLE fts_workspace USING fts5(
      entity_id,
      entity_type,
      title,
      content,
      updated_at UNINDEXED,
      tokenize = 'porter unicode61'
    );
    ```
*   **Database Triggers**: Insert, Update, and Delete triggers are attached to the `projects`, `tasks`, `notes`, and `sessions` tables. When data changes, SQLite automatically updates the search index:
    ```sql
    CREATE TRIGGER trg_projects_insert AFTER INSERT ON projects BEGIN
      INSERT INTO fts_workspace(entity_id, entity_type, title, content, updated_at)
      VALUES (new.id, 'project', new.name, new.tag || ' ' || COALESCE(new.description, ''), new.updated_at);
    END;
    ```

---

## 4. Migrations & Schema Initializations

*   **Initialization**: Managed via `initializer.ts` on startup. If the `schema_version` table is missing, the system executes `schema.sql` to build the database.
*   **Dynamic Migrations**: Schema alterations are handled sequentially. For example, the system checks for the presence of the `timeline_events` table and creates it if missing:
    ```typescript
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='timeline_events'").get();
    if (!tableCheck) {
      // Execute DDL updates...
    }
    ```

---

## 5. Storage Folder Layouts

On Windows systems, the database files are saved under the user's roaming directory:
*   **Database Path**: `C:\Users\<username>\AppData\Roaming\AKIRA\akira.db`
*   **File Vault Storage**: `C:\Users\<username>\AppData\Roaming\AKIRA\Vault\`

---

## 6. Future Considerations

*   **Automatic Backup Schedules**: Integrating zip backups of the database to local folders before running migrations.
*   **Query Profiling**: Building an execution duration logger to identify slow queries.
