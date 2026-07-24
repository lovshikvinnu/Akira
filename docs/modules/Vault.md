# Module: Secure File Vault

The File Vault module manages local file uploads, directory nesting, file deduplication, and file linking for AKIRA OS.

---

## 1. Overview & Responsibilities

The File Vault is responsible for:
1.  **Deduplicated Storage**: Using SHA-256 hashing to identify duplicate uploads. When a match is found, the vault references the existing file on disk instead of writing a new one.
2.  **MIME Verification**: Inspecting file magic-number bytes during upload to prevent file spoofing.
3.  **Circular Move Prevention**: Using SQL CTE checks to prevent moving parent directories inside child directories.
4.  **Audit Event Dispatching**: Dispatched automatically via SQLite triggers on insertion.

---

## 2. Directory Structure

```
src/akira-os/vault/
├── VaultFolderService.ts     # Directory CRUD operations and circular checks
├── VaultHashService.ts       # File streaming and SHA-256 hash generator
├── VaultStorageService.ts     # Upload coordinators and filesystem writer
├── VaultValidationService.ts  # File safety and MIME validation
├── index.ts                  # RPC functions and client services barrel
└── vault.test.ts             # File upload and deduplication tests
```

---

## 3. Upload & Deduplication Pipeline

```
[ Temp File Path ] ──► [ Magic Byte Check ] ──► [ SHA-256 Hash Generation ]
                                                        │
                                        ┌───────────────┴───────────────┐
                                        ▼                               ▼
                              (Duplicate Found)                 (New File Hash)
                                        │                               │
                              [ Reuse Storage Path ]          [ Write file to disk ]
                                        │                               │
                                        └───────────────┬───────────────┘
                                                        ▼
                                          [ Persist Logical Record ]
```

### 3.1. Upload Transaction Flow
When uploading, the vault executes operations within a SQLite transaction:
1.  Verify the path remains inside the vault folder root boundaries.
2.  Inspect file header magic numbers to verify MIME types.
3.  Generate the file's SHA-256 hash.
4.  If a duplicate hash exists, point the new database entry to the existing physical path.
5.  If it is a new file, copy it to the appropriate subfolder based on its category (e.g. `/Vault/Images/`).
6.  If any database write fails, the filesystem copy is automatically rolled back.

---

## 4. SQLite Schema & Triggers

The module relies on the following database schema:

```sql
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
  FOREIGN KEY (folder_id) REFERENCES vault_folders(id) ON DELETE SET NULL
);
```

### Automated Audit Logging Trigger:
```sql
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
```

---

## 5. UI Presentation

*   **Route**: `/tools/vault` (`src/routes/tools.vault.tsx`) and `/vault` (`src/routes/vault.tsx`).
*   **Layout Mode**: Uses `fit` mode to render a fixed-height layout grid containing file grids, category filters, and detail side panels.
*   **Media Previews**: Supports rendering image previews and file details directly in the interface.

---

## 6. Known Limitations & Future Work

*   **Manual Trash Cleanup**: Files remain in the trash bin until manually deleted.
*   **Planned Improvement**: Integrating automatic background trash clearing after 30 days.
