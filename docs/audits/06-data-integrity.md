# 06 — Data Integrity Audit

Central question: **can AKIRA recover its important state correctly after an unexpected shutdown?**

**Answer:** For workspace reality (projects, tasks, notes, sessions, vault metadata, settings, timeline, event store, analytics) — **mostly yes**, with the specific gaps below. For cognitive state (memories, stories, understanding, insights, identity, plans) — **no, and not partially**: nothing is written, so nothing can be recovered (GEN-002).

---

## DAT-001 — CRITICAL — 36 database writes are fire-and-forget with zero error handling

**Finding:** every workspace mutation in `src/persistence/akira-store.ts` updates the in-memory state, then dispatches the durable write as an un-awaited, un-caught dynamic-import promise.

**Evidence:**
```
grep -c 'import("../akira-os'  src/persistence/akira-store.ts  →  36
grep -c '\.catch('             src/persistence/akira-store.ts  →   0
grep -c 'await '               src/persistence/akira-store.ts  →   0
```

Canonical shape (`akira-store.ts:131-136`):
```ts
set((s) => ({ ...s, projects: [p, ...s.projects], lastProjectId: p.id }));

import("../akira-os/projects").then(({ projectsService }) => {
  projectsService.add(p);            // returns a Promise — discarded
});
import("../akira-os/settings").then(({ settingsService }) => {
  settingsService.updateLastProjectId(p.id);
});
```
`projectsService.add` is `async` and returns `persistAddProject({ data: input })`. Its rejection is never observed, at either level.

**Failure scenario:** the user creates a project while the SQLite file is locked by another process (`busy_timeout = 5000` exceeded), or the dev server has restarted, or the RPC returns 500. The UI shows the project. `useAkiraHydrated()` stays `true`. No toast, no console error, no retry, no queue. On the next reload `getInitialState()` returns the database contents and the project is simply gone.

**Blast radius:** all 36 sites — every project, task, note, session, chat message, streak and settings write in the application. This is the primary durability risk for user data.

**Contrast:** `src/routes/__root.tsx:216-241` *does* wrap hydration and migration in `try/catch` with `toast.error(...)`. The pattern is known; it is simply absent on the write path.

**ARCHITECTURE.md §2.2** describes this as intended behaviour ("Optimistic State Mutation … dispatching database mutations lazily"). Optimistic mutation is a legitimate pattern, but it requires reconciliation or rollback on failure. Neither exists.

---

## DAT-002 — CRITICAL — Vault deduplication corrupts sibling records on soft delete

**Finding:** the vault deduplicates by content hash — multiple `vault_files` rows share one physical `storage_path`. `deleteFile()` physically moves that shared file to `Trash/` but updates only the one row.

**Location:** `src/akira-os/vault/VaultStorageService.ts`

Dedup creates the sharing (`uploadFile`, lines 88-113):
```ts
const duplicates = VaultHashService.findDuplicates(hash);
if (duplicates.length > 0) {
  const existingFile = duplicates[0];
  targetRelativePath = existingFile.storagePath;      // ← shared path
  registeredId = vaultFileRepository.add({ …, storagePath: targetRelativePath, status: "Ready" });
  fs.unlinkSync(safeTempPath);
}
```

Soft delete breaks it (lines 238-258):
```ts
const sourcePath      = VaultValidationService.resolveSafePath(file.storagePath);
const trashRelativePath = `Trash/${file.id}${file.extension}`;
const trashAbsolutePath = VaultValidationService.resolveSafePath(trashRelativePath);
fs.mkdirSync(path.dirname(trashAbsolutePath), { recursive: true });
if (fs.existsSync(sourcePath)) { fs.renameSync(sourcePath, trashAbsolutePath); }   // ← moves the SHARED file
vaultFileRepository.update(fileId, { deletedAt: …, storagePath: trashRelativePath });  // ← updates ONE row
```

**Failure scenario:** the user uploads `report.pdf`, then uploads the identical file again as `report-final.pdf`. Two rows, one physical file at `Documents/<id1>.pdf`. The user deletes `report.pdf`. The physical file moves to `Trash/<id1>.pdf`. Row 2 (`report-final.pdf`, still `status: "Ready"`, `deletedAt: null`) still points at `Documents/<id1>.pdf`, which no longer exists. Opening it hits `getRawFileBase64Rpc` → `throw new Error("File is missing from disk: …")`. The user has lost a file they never deleted.

`restoreFile()` (lines 265-290) has the mirror-image defect.

**Proof that the correct logic exists elsewhere:** `permanentDeleteFile()` (lines 305-325) does refcount properly:
```ts
const count = vaultFileRepository.countReferencesByHash(file.hash);
vaultFileRepository.purge(fileId);
if (count === 1) { /* only then unlink the physical file */ }
```
`countReferencesByHash` is available and simply not used in `deleteFile`/`restoreFile`.

---

## DAT-003 — HIGH — Filesystem operations run inside SQLite transactions, and the compensation logic is inverted

**Finding:** `uploadFile` and `permanentDeleteFile` perform irreversible filesystem work inside `db.transaction(() => { … })()`. Filesystem operations are not transactional, so a commit failure rolls back the metadata while leaving the disk changed.

### `uploadFile` — compensation cannot fire

`src/akira-os/vault/VaultStorageService.ts:85-178`
```ts
let committed = false;
try {
  db.transaction(() => {
    …
    fs.mkdirSync(path.dirname(targetAbsolutePath), { recursive: true });
    fs.copyFileSync(safeTempPath, targetAbsolutePath);
    fs.unlinkSync(safeTempPath);
    vaultFileRepository.update(registeredId, { status: "Ready", storagePath: targetRelativePath });
    committed = true;                          // ← set INSIDE the transaction body
  })();
  …
} catch (err) {
  if (!committed && targetAbsolutePath && fs.existsSync(targetAbsolutePath)) {
    try { fs.unlinkSync(targetAbsolutePath); } catch (_) {}
  }
  throw err;
}
```
`committed = true` executes before `better-sqlite3` issues `COMMIT`. If the commit itself fails (disk full, `SQLITE_BUSY` at commit time, `SQLITE_FULL`), the exception is thrown with `committed === true`, so the rollback branch is skipped. Result: the file sits at `Documents/<id>.pdf` with **no database row referencing it** — an orphan consuming disk forever, invisible to the UI and to `permanentDeleteFile`'s refcounting.

Setting `committed = true` after the `})()` call would make the guard correct.

### `permanentDeleteFile` — no compensation at all

```ts
db.transaction(() => {
  const count = vaultFileRepository.countReferencesByHash(file.hash);
  vaultFileRepository.purge(fileId);
  if (count === 1) {
    const physicalPath = VaultValidationService.resolveSafePath(file.storagePath);
    if (fs.existsSync(physicalPath)) { fs.unlinkSync(physicalPath); }   // ← irreversible
  }
})();
```
A commit failure restores the metadata row while the file is already unlinked → a `Ready` row pointing at nothing. No `try/catch`, no compensation.

### `deleteFile` / `restoreFile` — no transaction at all

Both do `fs.renameSync(...)` and then `vaultFileRepository.update(...)` as two independent operations. A crash between them leaves `storage_path` pointing at the old location while the file is at the new one (or vice versa on restore).

---

## DAT-004 — HIGH — The Timeline's "resilience" buffer is a permanent data sink

**Location:** `src/persistence/repositories/SqliteTimelineRepository.ts:25`
```ts
// In-memory fallback queue for offline/read-only resilience under database locks
const fallbackQueue: TimelineEvent[] = [];
```
`insert()` (lines 43-69) catches any SQL failure and pushes into `fallbackQueue` with a `console.warn`. `findPaged()` (line 160) and `count()` blend the queue into query results.

**There is no drain.** `grep` finds no flush, retry, or re-insert path anywhere. Entries live until the process exits and are then lost.

**Failure scenario:** the vault or another writer holds a write lock beyond `busy_timeout = 5000`. Ten timeline events go to `fallbackQueue`. The UI's timeline shows all ten and `count()` reports them. The user restarts the app. Those ten events are gone, and there is no record that they ever existed — the only trace was a `console.warn`.

**Compounding:** `deleteById`, `deleteByProjectId`, `clearAll` and `count` all wrap their SQL in `try {} catch {}` with an **empty** handler (lines 241, 249, 260, 270). So `clearAll()` can silently no-op on the database while clearing only the in-memory queue, leaving the user believing the timeline was cleared.

---

## DAT-005 — HIGH — Event Store writes fail silently; Event Store and Timeline can diverge permanently

Detailed in `04-akira-os-platform.md` PLT-007, PLT-008, PLT-009. Integrity summary:

| Mechanism | Result |
| :--- | :--- |
| `PersistenceSubscriber.onEvent` → `repository.insert` throws | Caught by `EventBus.publish`'s per-subscriber `try/catch`; RPC still returns success |
| `isSerializable` rejects any nested `undefined`, `Map`, `Set`, `NaN`, or class instance | Event dropped from `events`, not from `timeline_events` (no equivalent check there) |
| Two subscribers, two tables, no shared transaction | Partial write is the normal failure mode, not an exception |
| Duplicate `id` on retry | `SQLITE_CONSTRAINT` → swallowed. Accidentally idempotent for `events`; for `timeline_events` the same id also collides, so it is also accidentally idempotent — but neither is designed or verified |

**Recovery consequence:** the Event Store is the declared immutable source of truth for analytics rebuilds (`RebuildManager`) and for `ConsistencyChecker`. Once an event is missing from `events` but present in `timeline_events`, **no rebuild can ever reconcile the two**, and the checker will report a permanent mismatch with no remedy.

---

## DAT-006 — MEDIUM — Search-cache invalidation is driven by a regex over SQL text

**Location:** `src/persistence/connection.ts:50-79` — `db.prepare` is monkey-patched at connection time:
```ts
const isWrite       = /insert\s+into|update|delete\s+from/i.test(sql);
const isSearchTable = /projects|tasks|notes|sessions|timeline_events/i.test(sql);
if (isWrite && isSearchTable) { /* wrap stmt.run to clear the search cache */ }
```

Correctness gaps:
1. **Misses writes it should catch:** `REPLACE INTO`, `INSERT OR REPLACE`, `UPSERT`/`ON CONFLICT DO UPDATE`, and anything executed via `db.exec(...)` rather than `db.prepare(...).run(...)` — which includes all of `initializer.ts`'s DDL and trigger-driven `fts_workspace` updates.
2. **Only wraps `stmt.run`.** `better-sqlite3` also mutates via `stmt.get()` / `stmt.all()` when the statement is a `RETURNING` clause, and via `stmt.iterate()`.
3. **Over-matches:** the table regex is unanchored and matches the *substring* `notes` — so `UPDATE projects SET notes = ?` matches for the wrong reason, and any statement mentioning a column named `notes` triggers a cache clear.
4. **Client-side cache is never invalidated.** `SearchManager` (`src/akira-os/search/services/index.ts:18`) keeps `private cache = new Map<string, CacheEntry>()` in the browser, populated from RPC results. `clearCache()` is called only from the server-side `prepare` hook. Client staleness is bounded only by `cacheTTL = 5000` ms.
5. The patch is not removed by `closeDatabaseConnection()`, and re-opening creates a fresh `Database` so the patch is re-applied — harmless, but the wrapper closes over the `import("../akira-os/search")` promise, which is why `persistence` and `akira-os/search` are in the same 19-file dependency cycle (BND-005).

**Risk:** stale search results after a mutation path that the regex misses. Bounded and non-destructive, but the mechanism is guesswork where an explicit invalidation call in each repository would be deterministic.

---

## DAT-007 — MEDIUM — Schema evolution has no path; two sources of truth for the vault schema

Detailed in `04-akira-os-platform.md` PLT-003. Integrity-specific consequences:

- `schema_version` only ever holds `1`. There is no way to determine whether a given `akira.db` has the current shape.
- The four "Dynamic Migration" blocks in `initializer.ts` are `if (!tableExists)` guards. They cannot add a column, change a constraint, or backfill. Any future change to `projects`, `tasks`, `notes`, `sessions`, `timeline_events`, `search_history`, `fts_workspace` or the 5 vault tables requires out-of-band intervention on every user's file.
- `src/persistence/migrations/002_file_vault.sql` (5.5 KB) is dead (`grep -rn "002_file_vault\|migrations/" src scripts` → no matches) while the same DDL is inlined in `initializer.ts`. Editing either one has no effect on the other.
- 18 FTS triggers and 8 vault triggers are created inside the `if (!searchHistoryCheck)` / `if (!vaultTableCheck)` blocks. If a user's database has `search_history` but is missing one trigger (e.g. created by an older build), the block never re-runs and the trigger is never restored — leaving `fts_workspace` permanently out of sync for that entity type, with no detection.

---

## DAT-008 — MEDIUM — `initializeDatabase()` failure at startup is logged and ignored

**Location:** `src/server.ts:8-12`
```ts
try {
  initializeDatabase();
} catch (error) {
  console.error("Critical: Failed to initialize SQLite database on startup:", error);
}
```
The server then starts and serves requests. Every RPC handler calls `getDatabaseConnection()`, which will either fail per-request or operate against a partially-initialised schema. `initializeDatabase` itself throws only for a missing `schema.sql`; the DDL transaction can also fail (permissions, disk full).

**Risk:** the process presents as healthy while every write path is broken. A local-first app whose only storage failed to initialise should refuse to start, not degrade silently.

---

## DAT-009 — MEDIUM — RPC id passthrough works only because validation is absent

**Finding:** `akira.addProject()` generates `p.id` client-side and passes the whole object:
```ts
projectsService.add(p);       // p includes id, progress, createdAt, …
```
`projectsService.add`'s declared parameter type is `{ name, tag?, description?, color?, icon? }` — **no `id`**. `persistAddProject`'s `.validator` is an identity function, so `id` survives to `projectRepository.add(input)`, which honours it:
```ts
const id = input.id || crypto.randomUUID();
```

**Risk:** id continuity between the client store and the database currently depends on the validator being a no-op. The moment PLT-001 is remediated with a `zod` schema matching the declared type, `id` is stripped, the server generates a different id, and every client-held reference (`lastProjectId`, `task.projectId`, timeline `project_id`, `vault_file_links.entity_id`, event payload `id`) silently points at a non-existent row after the next reload. Any validation work must add `id` to the schemas first.

The same pattern applies to `tasksService.add`, `notesService.add`, `sessionsService.*` and the vault services.

---

## DAT-010 — LOW — Analytics incremental state can advance past unprocessed events

Detailed in PLT-015. Integrity summary: `lastProcessedTimestamp + 1 ms` combined with non-deterministic same-millisecond ordering (PLT-006) means events can be permanently excluded from aggregation while the watermark records them as done. `rebuildAll()` is the only remedy, and it must be triggered manually.

---

## DAT-011 — LOW — Test artefacts and scratch databases are committed to the repository

`git ls-files` includes:
```
src/persistence/temp_e2e_akira.db          (4 KB)
src/persistence/temp_e2e_akira.db-shm      (32 KB)
src/persistence/temp_e2e_akira.db-wal      (103 KB)
src/persistence/check_real_db.ts
src/persistence/check_temp_db.ts
src/persistence/validate_migration.ts
src/persistence/validateMigration.ts
```
plus the untracked-but-present `src/persistence/scratch/VaultTest/Temp/`, which `src/akira-os/vault/vault.test.ts:6-9` sets as `AKIRA_VAULT_PATH` — so the vault test writes real files into the source tree.

`.gitignore` covers `tmp/`, `temp/` and `coverage/` but no `*.db` pattern.

**Risk:** low in itself, but a stale WAL file next to `initializer.ts` invites confusion about which database is authoritative, and `validate_migration.ts` / `validateMigration.ts` are two differently-cased files with the same purpose (a hazard on case-insensitive filesystems).

---

## Crash-recovery matrix

| Data class | Storage | Survives unexpected shutdown? | Notes |
| :--- | :--- | :--- | :--- |
| Projects / tasks / notes / sessions | SQLite | **Only if the fire-and-forget write landed** (DAT-001) | No retry, no queue, no error surfaced |
| Settings / profile / chat / streaks | SQLite `settings` (JSON blobs) | Same as above | Values are `JSON.parse`d without schema validation on read |
| Vault metadata | SQLite | Yes | But can point at a moved/missing file (DAT-002, DAT-003) |
| Vault file bytes | Filesystem | Yes, unless orphaned or shared-then-moved (DAT-002, DAT-003) | Orphans are unreachable and un-garbage-collected |
| Timeline events | SQLite + in-memory fallback | Yes for the SQLite ones; **never** for buffered ones (DAT-004) | No drain path |
| Event Store | SQLite | Yes for accepted events; rejected events are lost silently (DAT-005) | Non-deterministic replay order (PLT-006) |
| Analytics aggregates | SQLite, derived | Yes, and rebuildable — but rebuild is UTC-only (PLT-014) and can skip events (PLT-015) | `rebuildAll` self-heals a crashed rebuild |
| AI provider config + API keys | SQLite `settings` | Yes | Plaintext (see `09-security-audit.md` SEC-002) |
| **GENESIS memories / candidates** | **process memory only** | **No** | GEN-002 |
| **GENESIS stories / understandings / insights** | **process memory only** | **No** | GEN-002 |
| **GENESIS identity graph** | `InMemoryIdentityRepository` | **No** | GEN-002 |
| **GENESIS plans / milestones / tasks** | 7 × `InMemory*Repository` | **No** | GEN-002 |
| Legacy localStorage state | migrated once to SQLite | Yes | `executeMigration` is genuinely robust — see below |

---

## What is genuinely correct and should not be changed

| Mechanism | Why it is good |
| :--- | :--- |
| `src/persistence/migration-impl.ts` | Real idempotency via a `migration_history` table with `running`/`completed` status; JSON parse guarded; per-field array-shape validation; schema-version precondition check; transactional import; typed `MigrationResponse` with a `status` discriminant. This is the most defensively written data-path code in the repository. |
| `connection.ts` PRAGMAs | `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `auto_vacuum = INCREMENTAL` — correct choices for a local-first single-writer app. |
| `schema.sql` constraint discipline | `CHECK (favorite IN (0,1))`, `CHECK (size_bytes >= 0)`, `CHECK (status IN ('Uploading','Ready','Failed'))`, `CHECK (entity_type IN (...))`, `UNIQUE(file_id, entity_type, entity_id)`, and `ON DELETE CASCADE` / `SET NULL` on every FK. Real integrity enforced at the storage layer. |
| Polymorphic-link cleanup triggers | `trg_vault_links_cleanup_{projects,tasks,notes,sessions}` correctly prevent orphaned `vault_file_links` rows that FKs cannot cover. |
| Tag garbage-collection trigger | `trg_vault_file_tags_cleanup` deletes an unused tag only when no other link remains. |
| `SqliteTimelineRepository.findPaged` keyset pagination | Composite `(timestamp, id)` cursor with correct `<`/`>` tie-breaking in both sort directions. Correct, stable, and O(log n). |
| `SqliteEventRepository` write validation | Serialisability, timestamp and version are all checked *before* the `INSERT`. The validation is right; only its error handling downstream is wrong. |
| `runEventStoreMigration` | DDL + all 5 indexes created inside one `db.transaction`. |
| Vault magic-byte MIME verification | `validateMagicNumberMime` checks real file signatures for PDF/PNG/JPEG/GIF/ZIP rather than trusting the declared MIME type. |
| SHA-256 content hashing + dedup index | `idx_vault_files_hash` plus stream hashing is the right design; only the delete/restore paths mishandle it. |
