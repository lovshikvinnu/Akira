# Vault Security & Data Integrity Recovery

**Program:** AKIRA Foundation Recovery
**Scope:** `src/akira-os/vault` and its directly related tests / persistence contract
**Date:** 2026-09-03
**Branch:** `main` (not committed — awaiting review)

---

## 1. Confirmed Defects

All three were reproduced against the repository as it stood, not inferred.

### D1 — Path traversal via prefix matching (Security, High)

`VaultValidationService.resolveSafePath` enforced its boundary with
`resolved.startsWith(root)`. A string prefix test does not respect path
segment boundaries, so any sibling directory whose name merely *begins with*
the Vault root's name passed the check.

Reproduction (`root = C:\data\Vault`):

| Input | Resolved to | Old verdict |
| --- | --- | --- |
| `../Vault_secrets/x` | `C:\data\Vault_secrets\x` | **ALLOWED** ← escape |
| `/etc/passwd` | `C:\data\Vault\etc\passwd` | ALLOWED (silently rewritten) |
| `C:/Windows/system32/x` | `C:\data\Vault\C:\Windows\system32\x` | ALLOWED (malformed) |
| `../../invalid-path/secret.db` | `C:\invalid-path\secret.db` | blocked |
| `nested/../../escape.txt` | `C:\data\escape.txt` | blocked |

The only traversal case the existing test covered (`../../invalid-path/...`)
happened to escape *past* the shared prefix and was therefore blocked. The
single-level sibling escape — the actual hole — was untested.

### D2 — Soft delete destroys a deduplicated sibling's content (Data loss, High)

Deduplication points multiple logical records at **one physical file**:
`uploadFile` reuses `existingFile.storagePath` verbatim for the new record.

`deleteFile` then did an unconditional `fs.renameSync(source, Trash/...)` and
updated only the deleted record's `storage_path`. Every other record still
pointing at the old path was left dangling.

```
Record A ──┐
           ├── Documents/<A>.pdf        (one physical file)
Record B ──┘

deleteFile(A)  →  file renamed to Trash/<A>.pdf, only A's path updated
                  B is still "active", still points at Documents/<A>.pdf
                  → B's content is GONE from the user's perspective
```

The user deleted A. B was never deleted, yet `getRawFileBase64Rpc` now throws
`File is missing from disk` for B. This is the required data-integrity
principle violated directly.

### D3 — Deduplication against soft-deleted records, and hash-based physical cleanup (Data loss + storage leak)

Two further breaks in the same ownership model:

- `VaultHashService.findDuplicates` → `getByHash` returns **all** rows,
  including soft-deleted ones, ordered `created_at DESC`. A new upload matching
  a trashed file was registered `status: "Ready"`, `deleted_at: NULL`, but with
  `storagePath = Trash/<originalId><ext>` — a live file whose bytes sit in the
  bin, and which loses them when the original is restored or purged. The
  freshly uploaded temp file was deleted, so the content had no other copy.
- `permanentDeleteFile` counted references with
  `countReferencesByHash(file.hash)`. The hash is not the ownership key. Two
  records can share a hash while occupying **separate** physical files (a
  duplicate re-added after the original was trashed), so the count both spared
  files that nothing referenced — orphaning them on disk forever — and could,
  in the reverse direction, be relied on to protect bytes it did not describe.

### D0 — The entire Vault test suite was dead (Process)

Baseline `npx vitest run src/akira-os/vault/vault.test.ts`:

```
Error: No test suite found in file .../vault.test.ts
Test Files  1 failed (1)
     Tests  no tests
```

Four Vault test files declared cases through a local `test()` helper that
vitest never saw. Two of them (`vault-db.test.ts`, `vault-ui.test.tsx`) went
further and wrapped each case in `try/catch` that only `console.error`-ed
failures, so they reported success regardless of what the code did.

**Vault regression protection at baseline was zero.** Notably, the existing
"Deletion Reference Counting & Recovery" case walked straight through the D2
scenario and never checked the surviving sibling.

---

## 2. Root Causes

| Defect | Root cause | Evidence |
| --- | --- | --- |
| D1 | Boundary expressed as a string prefix, not a path relationship | `VaultValidationService.ts:28` (pre-fix) |
| D2 | Physical file lifetime decided per *record* while storage is shared per *path* | `VaultStorageService.ts:240-255` (pre-fix) |
| D3a | Dedup candidate selection ignored `deleted_at` / `status` | `VaultHashService.ts:47`, `SqliteVaultFileRepository.ts:97` |
| D3b | Reference counting keyed on content hash rather than storage path | `VaultStorageService.ts:311` (pre-fix) |
| D0 | Local test harness never delegated to the vitest runner | `vault.test.ts:29-33` (pre-fix) |

The unifying cause for D2/D3: **the code had no single answer to "who owns
these bytes?"** Deduplication created shared ownership, but delete, restore and
purge each reasoned about ownership differently (record identity, then content
hash), and none of them by the thing that actually identifies the bytes — the
storage path.

---

## 3. Security Fix

`src/akira-os/vault/VaultValidationService.ts`

```ts
const resolved = path.resolve(root, relativePath);
const relativeToRoot = path.relative(root, resolved);

const escapesRoot =
  relativeToRoot === ".." ||
  relativeToRoot.startsWith(`..${path.sep}`) ||
  path.isAbsolute(relativeToRoot);
```

Deriving the relative path and rejecting any result that walks up or stays
absolute compares **whole path segments**, which is what the prefix test failed
to do. Properties:

- `../Vault_secrets/x` → relative `..\Vault_secrets\x` → rejected.
- A different drive (`D:\x`) leaves `path.relative` absolute → rejected.
- `path.resolve` (rather than `path.join`) means an absolute external path is
  *rejected* instead of silently rewritten into a Vault-relative one.
- `..hidden.pdf` is still a legal filename — the check is segment-aware, so it
  is not over-blocked.
- The root itself (`""`) still resolves, as `deleteFile`/`restoreFile` rely on.

No caller passes an absolute path (`VaultStorageService` and
`server/index.ts:112` both pass DB-relative `storagePath` values), so the
stricter absolute handling changes no legitimate call site.

**Known residual limitation:** this is path-arithmetic containment. A symlink
*inside* the Vault root pointing outside it would still resolve through. Closing
that requires `fs.realpath` on the parent chain, which cannot run for
not-yet-created destination paths and would be a materially larger change; it is
recorded here rather than implemented, as the Vault creates its own directory
tree and no code path creates links.

---

## 4. Data Integrity Fix

The fix installs one consistent ownership key: **the storage path**.

**New repository method** (additive; no schema change, no migration):

```ts
countReferencesByStoragePath(storagePath: string): number;
```

It counts *all* rows at a path, soft-deleted included — a trashed record still
needs its bytes in order to be restorable.

**`deleteFile`** — a physical file is relocated to `Trash/` only when it is
exclusively owned. A shared file keeps its path and is merely marked deleted; it
becomes movable again once it is the last reference.

**`restoreFile`** — symmetrically, only a file actually parked in `Trash/` and
exclusively owned is moved back. A record that was never moved just has its
deletion marker cleared.

**`uploadFile`** — a dedup candidate must be live, `Ready`, *and* still present
on disk:

```ts
const reusableDuplicate = VaultHashService.findDuplicates(hash).find(
  (candidate) =>
    candidate.deletedAt === null &&
    candidate.status === "Ready" &&
    fs.existsSync(VaultValidationService.resolveSafePath(candidate.storagePath)),
);
```

The `existsSync` arm matters beyond D3: it means a record left dangling by the
old defect (or by any external file removal) can no longer swallow a fresh
upload. The new upload creates its own physical file instead of being discarded
against a broken pointer — the system self-heals on re-upload.

**`permanentDeleteFile`** — counts by storage path instead of hash, so bytes are
unlinked exactly when the last record referencing them is purged: no premature
deletion, no orphans.

Public APIs are unchanged. `countReferencesByHash` is retained (it is still a
valid "how many logical copies of this content exist" query) but is no longer
used for physical-lifetime decisions. No storage architecture was introduced and
no unrelated database infrastructure was touched.

---

## 5. Regression Tests

### New — `src/akira-os/vault/vault-security.test.ts` (19 tests)

Env vars are set before **dynamic** imports, because ESM evaluates every static
`import` declaration before any statement in the module body — a static import
would read the DB/Vault paths before the assignments land.

Path safety (9 tests): legitimate nested paths; root and interior `..` that
stays inside; the prefix-collision sibling escape; parent and nested traversal
(8 vectors); absolute external paths; backslash separators on Windows; an
absolute path already inside the root; legitimate `..`-prefixed filenames not
over-rejected; and a property check that no accepted input ever resolves outside
the root.

Data integrity (10 tests) — every one asserts on **user-visible bytes**
(`readFileSync` of the resolved path), not on internal state:

- duplicates share one physical file and both read back correctly;
- soft-deleting one deduplicated record leaves the sibling's content readable;
- an exclusively owned file moves to `Trash/` and returns on restore;
- restoring a shared record does not disturb its sibling;
- a file re-added after the original was trashed does **not** land in `Trash/`,
  survives the original's purge, and leaves no orphan behind;
- restoring a trashed original leaves the re-added copy intact;
- bytes are unlinked only when the last reference is purged;
- a soft-deleted last reference stays recoverable after its duplicate is purged;
- purging one file leaves unrelated content untouched;
- a fresh upload is not discarded against a dangling dedup target.

**Red/green verification.** With the source fixes reverted (`git stash`) and the
new tests kept, **9 of 19 fail**, including:

```
× rejects the prefix-collision escape into a sibling directory
× keeps a deduplicated sibling readable after the other record is soft-deleted
    AssertionError: expected null to be '%PDF-1.5 Vault recovery fixture'
```

That `null` is the data loss itself. With the fixes applied, 19/19 pass.

### Revived — four previously dead suites

`vault.test.ts` (8), `vault-db.test.ts` (7), `vault-ui.test.tsx` and
`vault-feature.test.tsx` (9 combined) now delegate to the vitest runner. The
change is a one-function substitution per file; every existing case body is
unchanged.

One existing assertion required correction. `vault.test.ts` asserted that
soft-deleting a **deduplicated** file relocates the shared physical file to
`Trash/` — that is precisely the D2 data-loss behaviour. It now asserts the safe
behaviour, and `Trash/` relocation for an exclusively owned file is covered
explicitly in the new suite. Re-running the revived suite against unfixed source
produces 2 failures; against fixed source, 1 (see §7).

---

## 6. Existing Data Impact

**Evidence gathered**, not assumed. The production database and Vault directory
on this machine were inspected read-only:

```
C:\Users\lovsh\AppData\Roaming\AKIRA\akira.db      exists
C:\Users\lovsh\AppData\Roaming\AKIRA\Vault         exists, contains only: [Temp]

vault_files row count: 0
  dangling records (metadata with no file on disk): 0
  ACTIVE records located in Trash/:                 0
  deduplicated (shared) storage paths:              0
```

**NO MIGRATION REQUIRED** — and this is a verified statement about this
installation, not a default. The Vault table exists but has never held a record,
and no files were ever stored, so no row can carry damage from the old code.

Because a migration cannot be justified on this evidence, none was written.
However, the defect *was* capable of corrupting data, so for any **other**
installation that did store files the following states are possible and should
be checked before that database is trusted:

| State | Detection | Consequence |
| --- | --- | --- |
| Active record whose file was carried into `Trash/` by a sibling's deletion | `deleted_at IS NULL` and file absent at `storage_path` | File appears in the UI, download fails |
| Active record whose `storage_path` starts with `Trash/` | `deleted_at IS NULL AND storage_path LIKE 'Trash/%'` | Live file with bytes in the bin |
| Physical file orphaned by hash-based purge | file on disk with no matching `storage_path` row | Wasted storage only |

Detection query:

```sql
SELECT id, display_name, storage_path, deleted_at FROM vault_files
WHERE deleted_at IS NULL AND storage_path LIKE 'Trash/%';
```

For the first state the content is usually still recoverable: a sibling row with
the same `hash` points at the file's new location, so a repair can re-point the
dangling row. The fixed code does not compound any of these — `restoreFile` and
`permanentDeleteFile` now refuse to move or unlink a shared file, and
`uploadFile` skips a dangling dedup target rather than discarding a new upload
into it.

**Escalation:** if this build has been distributed to any installation that
stored Vault files, run the detection query there before use. That is a data
question this repository cannot answer.

---

## 7. Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| Path Traversal Tests | **PASS** | 9/9 |
| Data Integrity Tests | **PASS** | 10/10 |
| Relevant Vault Tests | **PASS (1 pre-existing failure)** | 42/43; see below |
| Full Test Suite | **PASS (pre-existing failures only)** | 379/380 tests; 16 suite-level failures, all pre-existing |
| Type Check | **PASS for Vault** | 9 errors repo-wide, none in any Vault file |
| Production Build | **PASS** | `vite build` — built in 1.24s, exit 0 |
| ESLint (changed files) | **PASS** | clean |
| Prettier (changed files) | **PASS** | clean |

### Failures NOT introduced by this task

**1. `vault.test.ts > Timeline Integration event logging` — pre-existing, escalated.**

Proven pre-existing: with the source fixes stashed and only the runner revival
kept, this case fails identically. It was invisible before only because the
suite never ran.

Root cause (traced, deliberately **not** fixed — out of scope):
the repository has **two unrelated event bus implementations**, and nothing
bridges them.

- `src/instrumentation/publisher.ts:27` publishes to `globalEventBus` from
  `src/instrumentation/event-bus.ts`.
- The test subscribes to `eventBus` from
  `src/shared/infrastructure/event-bus/index.ts`, a separate `SimpleEventBus`.

So `vault.folder.created` is published, but no app-layer subscriber can ever
receive it. This is Event → GENESIS pipeline territory and belongs to the
parallel Phase B (Event Architecture Reconciliation) work; per this task's
constraints it was left untouched. **Impact is wider than the Vault** — every
domain event published through `publish()` has the same gap.

**2. Type check — 9 errors, none in Vault.**

- `src/contracts/events.ts:76,77` — TS1117 duplicate object keys (file is
  unmodified in git; pre-existing on `main`).
- `src/diagnostics/core/diagnostics-manager.ts` — 7 errors, missing modules.

**3. Full suite — 16 suite-level failures.**

Overwhelmingly the same dead-runner pattern found in the Vault
(`No test suite found in file`) across timeline, instrumentation, presence,
search, tools and analytics suites, plus one import error in
`src/routes/timeline.tsx`. All pre-existing and outside this task's scope. This
task reduced the count by four by reviving the Vault suites.

These repo-wide totals drift during the session because the parallel recovery
task is landing changes concurrently; the figures above are from the final run
of this task. The Vault figures (43 tests, 1 pre-existing failure) are stable.

Vault test count went from **0 executing** to **43 executing, 42 passing**.

---

## 8. Git Report

No commit was made — awaiting review.

**Modified (this task):**

```
src/akira-os/vault/VaultValidationService.ts          security fix
src/akira-os/vault/VaultStorageService.ts             data integrity fix
src/contracts/repositories/VaultFileRepository.ts     + countReferencesByStoragePath
src/persistence/repositories/SqliteVaultFileRepository.ts   implementation
src/akira-os/vault/vault.test.ts                      runner revival + 1 assertion corrected
src/persistence/vault-db.test.ts                      runner revival
src/components/vault/vault-ui.test.tsx                runner revival
src/components/vault/vault-feature.test.tsx           runner revival
```

**New:**

```
src/akira-os/vault/vault-security.test.ts             19 regression tests
docs/recovery/vault-security-data-integrity-recovery.md
```

**Untracked (generated):** `src/persistence/scratch/` — test fixture output.
`vault.test.ts` already generated into this directory before this task; the new
suite adds a `VaultSecurityTest/` sibling. Left as-is rather than editing shared
`.gitignore` while parallel work is in flight.

**Potential conflicts with the parallel recovery task:** none observed. That task
holds `src/persistence/connection.ts` and `tests/database-path-safety.test.ts`,
neither of which was touched here. The one adjacency worth noting is that
`getVaultRoot()` derives from `getDatabasePath()`, so their database-path changes
move the Vault root with them — the fix above is written against whatever root
that function returns and does not hard-code a location. No file was edited by
both tasks.
