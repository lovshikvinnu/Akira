# Module: Universal Search Engine

The Search module provides workspace-wide, full-text search capability. It uses SQLite FTS5 indexes and a query cache system.

---

## 1. Overview & Responsibilities

The Search subsystem is responsible for:
1.  **Universal Search Queries**: Providing a single entry point to search across projects, tasks, notes, sessions, timeline events, and files.
2.  **FTS5 Execution**: Using SQLite's FTS5 virtual table queries to perform fast textual searches.
3.  **Search History Logging**: Recording user queries and matching result counts to show historical search items.
4.  **Query Caching**: Maintaining a local cache of recent searches (TTL 5 seconds, max cache size 50, LRU eviction) to prevent redundant database lookups.
5.  **Cache Invalidation**: Clearing the search cache whenever write mutations occur.

---

## 2. Directory Structure

```
src/akira-os/search/
├── index.ts             # Contains SearchManager, services, and RPC server functions
└── search.test.ts       # Query caching, token matching, and database search tests
```

---

## 3. Architecture & Query Caching Flow

```
              [ Client Search Request ]
                          │
                          ▼
            ┌───────────────────────────┐
            │   Check In-Memory Cache   │
            └─────────────┬─────────────┘
                          │
                ┌─────────┴─────────┐
          (Yes) │                   │ (No)
                ▼                   ▼
         [ Return Cached ]    [ Fetch from SQLite FTS ]
                                    │
                                    ▼
                              [ Save Cache ]
```

*   **Cache Invalidation**: Validations are wired directly into database writes. When a mutation prepared statement is run on SQLite tables (handled via `connection.ts` préparers), it triggers:
    ```typescript
    searchService.clearCache();
    ```

---

## 4. SQLite Schema & Triggers

The search uses the `fts_workspace` virtual table:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS fts_workspace USING fts5(
  entity_id,
  entity_type,
  title,
  content,
  updated_at UNINDEXED,
  tokenize = 'porter unicode61'
);
```

Database triggers synchronise the FTS index when records are added or updated:

```sql
CREATE TRIGGER IF NOT EXISTS trg_projects_insert AFTER INSERT ON projects BEGIN
  INSERT INTO fts_workspace(entity_id, entity_type, title, content, updated_at)
  VALUES (new.id, 'project', new.name, new.tag || ' ' || COALESCE(new.description, ''), new.updated_at);
END;
```

---

## 5. UI Presentation

*   **Route**: `/search` (`src/routes/search.tsx`).
*   **Search Box**: Displays search history queries and auto-suggests results as the user types.
*   **Results**: Grouped by category (Projects, Tasks, Notes, etc.) with matching text highlighted.

---

## 6. Known Limitations & Future Work

*   **Cache TTL Duration**: The default 5-second TTL is static.
*   **Planned Improvement**: Supporting configurable cache durations and pre-fetching search indexes during application boot.
