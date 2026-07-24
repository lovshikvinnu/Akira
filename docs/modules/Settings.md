# Module: Settings Dashboard & Profile Configuration

The Settings module handles key-value configuration storage, user profile setup, developer mode toggles, chat log storage, and habit streaks tracking for AKIRA OS.

---

## 1. Overview & Responsibilities

The Settings subsystem is responsible for:
1.  **Dynamic Key-Value Storage**: Providing a simple key-value interface to persist configurations in SQLite.
2.  **Profile Management**: Saving user info (name, role, custom motto, avatar letters).
3.  **State Persistence**: Persisting system status parameters like the last active project ID, chat messages, and streak data.
4.  **Developer Mode Control**: Toggling advanced panels (e.g. *Brain Inspector*) in the sidebar navigation.

---

## 2. Directory Structure

```
src/akira-os/settings/
└── index.ts             # Settings service definitions, key mutations, and RPC functions
```

---

## 3. Storage & JSON Serialization Flow

Settings values are stored as JSON-serialized strings in the database.

```
[ Object State ] ──► [ JSON.stringify(payload) ] ──► [ settingsRepository.set ] ──► [ SQLite DB ]
```

### Supported Configuration Keys
*   `profile`: Stores the user profile (name, role, motto).
*   `last_project_id`: Tracks the last active project ID.
*   `chat`: Stores the history of chat messages.
*   `streaks`: Manages user focus habit streak records.

---

## 4. SQLite Schema

Settings are saved in the `settings` table:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                   -- JSON-serialized text value
  updated_at TEXT NOT NULL
);
```

### Invalidation & Cache Syncs
*   Reads are performed once on application boot via `getInitialState()` to populate the client-side `akira-store`.
*   Writes immediately update the local memory store (optimistic rendering) before dispatching the database mutation RPC.

---

## 5. UI Presentation

*   **Route**: `/settings` (`src/routes/settings.tsx`).
*   **Layout Mode**: Uses `scroll` mode to render settings options (profile name editing, motto adjustments, system diagnostics, database reset triggers).
*   **Developer Mode Toggle**: Enabling Developer Mode displays the *Brain Inspector* route (`/brain`) in the sidebar navigation.

---

## 6. Known Limitations & Future Work

*   **Flat Value Layout**: All configurations are stored in a single table, requiring individual serialization for each key.
*   **Planned Improvement**: Supporting database config tables or dedicated setting columns to improve relational indexing.
