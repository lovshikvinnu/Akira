# Stage 1C — Summary

**HEAD:** `b561730` · **Date:** 2026-09-03 · **Nothing committed.**

| Report | |
| :--- | :--- |
| [`stage-1c-repository-integrity.md`](stage-1c-repository-integrity.md) | Part A — file verification, staging, clean reproduction |
| [`stage-1c-test-database-safety.md`](stage-1c-test-database-safety.md) | Part B — path architecture, root cause, fix, regression tests |

---

## 1. Changes Made

### 1.1 `src/persistence/connection.ts` — the only production behaviour change

| | |
| :--- | :--- |
| **Problem** | `getDatabasePath()` fell back to the user's persistent database (`%APPDATA%/AKIRA/akira.db`) whenever `AKIRA_DATABASE_PATH` was unset. A test wrote the event `evt-async-1` / `source: "tasks-test"` into the real database. |
| **Root Cause** | **ESM import hoisting.** Ten test files assigned `process.env.AKIRA_DATABASE_PATH = ":memory:"` at line 1, but ESM evaluates every `import` declaration *before* any statement in the module body — and imported modules open the database at module scope (`persistence/repositories/index.ts` creates 11 repository singletons; `analytics/validation/diagnostics.ts:86` creates `diagnosticsService` → `new SqliteAnalyticsRepository()` → `getDatabaseConnection()`). By the time line 1 ran, the production handle was already cached in `dbInstance`. The pattern is structurally incapable of working. A further 17 test files reached the connector with no override at all, and `process.env` persists across files in a shared Vitest worker, making the outcome order-dependent. |
| **Fix** | Added a third resolution branch at the single existing choke point. Explicit `AKIRA_DATABASE_PATH` still wins (branch 1); under a test runner the resolver returns `TEST_DATABASE_PATH = ":memory:"` (branch 2); the production default (branch 3) is byte-identical to before. Test detection uses `process.env.VITEST === "true" \|\| process.env.NODE_ENV === "test"` — both set by Vitest in every worker, so no per-file cooperation is required. Verified by probe, not assumed. |
| **Verification** | 10 new assertive regression tests pass. Full suite in a clean environment: **337 passed, 0 failed**. Real database byte-identical before and after every run: `md5=75c2c9422467c053586db7bb02fc4208`, `size=1753088`, `mtime=Jul 25 21:23`, and no `-wal`/`-shm` sidecars ever appeared. A full suite run created **no** database file anywhere in the tree. |

No `@ts-ignore`, no `@ts-expect-error`, no `any`, no silent catch, no hardcoded personal path. Net: +30 lines (23 of them documentation), 0 removed.

### 1.2 `tests/database-path-safety.test.ts` — new

| | |
| :--- | :--- |
| **Problem** | No automated protection existed for the test/production database boundary. |
| **Root Cause** | The boundary had never been asserted anywhere. |
| **Fix** | 10 Vitest tests with real assertions across three groups: **test isolation** (6), **explicit override behaviour** (2), **production preservation** (2). Uses `fs.mkdtempSync` fixtures with `APPDATA` repointed at an isolated stand-in — never the user's real database. Snapshots and restores all four relevant env vars, and calls `closeDatabaseConnection()` in `afterEach`. |
| **Verification** | `npx vitest run tests/database-path-safety.test.ts` → 10 passed. The strongest two assert that a sentinel production fixture is unchanged in **content, size and directory listing** after `initializeDatabase()` and a real `projectRepository.add(...)` — the unchanged listing proving no `-wal`/`-shm` sidecar, i.e. the fixture was never opened. |

### 1.3 Repository integrity — 33 previously-uncommitted Stage 1A files staged

| | |
| :--- | :--- |
| **Problem** | A clean clone of `main` reproduced the original P0: 103 type errors, `vite build` exit 1. |
| **Root Cause** | The entire Stage 1A recovery lived only in the working tree — 3 untracked new files **and 30 uncommitted modifications**. |
| **Fix** | All 33 staged after verification. The 3 new files were each checked for justification, contract conformance, and forbidden content (§2 of the integrity report). The 30 modified files were diff-reviewed: **zero `any` added, one pre-existing `as any` removed**, no debug/TODO/suppressions. |
| **Verification** | Staged tree exported with `git archive $(git write-tree)` into a clean directory, `npm ci` from lockfile alone → type check 9 errors (documented holds only), 337 tests passed, build exit 0, dev startup HTTP 200. |

**Critical finding:** the 3 untracked files alone are **necessary but not sufficient**. Tested in isolation, they produce a passing build (exit 0) but **100 type errors and 1 failing test**, because `HealthRuleEngine.ts` was still the concatenated version and the `DerivedCompletionRule` guard was missing — both live in the modified half. `vite build` does not type-check, so the build alone is not a sufficient integrity signal.

---

## 2. Git State

**Nothing was committed.** Staging is reversible with `git reset`.

### Staged — 35 files

| Group | Count |
| :--- | ---: |
| Stage 1A recovery: new files (`createHealthRuleEngine.ts`, `HealthyRule.ts`, `event-adapter.ts`) | 3 |
| Stage 1A recovery: modifications | 30 |
| Stage 1C Part B: `src/persistence/connection.ts` | 1 |
| Stage 1C Part B: `tests/database-path-safety.test.ts` | 1 |

### Modified but unstaged — 8 files (another session's work, deliberately untouched)

```
src/akira-os/vault/VaultStorageService.ts
src/akira-os/vault/VaultValidationService.ts
src/akira-os/vault/vault.test.ts
src/components/vault/vault-feature.test.tsx
src/components/vault/vault-ui.test.tsx
src/contracts/repositories/VaultFileRepository.ts
src/persistence/repositories/SqliteVaultFileRepository.ts
src/persistence/vault-db.test.ts
```

### Untracked

```
docs/recovery/*.md                              (8 recovery reports — left untracked per instruction)
src/akira-os/vault/vault-security.test.ts       (another session's new test)
src/persistence/scratch/                         (test scratch directory)
```

### Committed

Nothing. `HEAD` is unchanged at `b561730`.

---

## 3. Verification Matrix

Measured against the **staged tree** (`git write-tree` → `fad1e48c`), exported to a clean directory with no `node_modules`, no database, no generated artifacts, and none of the concurrent session's unstaged work.

| Check | Result | Evidence |
| :--- | :--- | :--- |
| **Clean Repository** | **PASS** | 779 files exported from the index; `node_modules` absent; `vault.test.ts` at `HEAD` version, confirming no concurrent WIP leaked in |
| **npm ci** | **PASS** | 484 packages in 32s from `package-lock.json` alone, exit 0. No package version modified. |
| **Type Check** | **FAIL — 9 errors** | Exactly the two documented Stage 1A holds: 7 × `src/diagnostics/core/diagnostics-manager.ts`, 2 × `src/contracts/events.ts`. **No new error introduced by Stage 1C.** |
| **Tests** | **PASS** | 24 files passed / 19 fail-to-load (pre-existing, Master Audit CRIT-007); **337 tests passed, 0 failed** — up from 327, the delta being the 10 new safety tests |
| **Production Build** | **PASS** | `npx vite build` exit 0 |
| **Development Startup** | **PASS** | `npx vite dev` → `http://localhost:8080`; `/`, `/projects`, `/settings` all HTTP 200 SSR-rendered; log clean: `SQLite Database initialized successfully with schema version 1` |
| **Test DB Isolation** | **PASS** | 10 assertive tests; no database file created anywhere by a full suite run; real database byte-identical (same MD5, size, mtime, no WAL sidecars) |

### Database-specific verification

| Check | Result |
| :--- | :--- |
| Fresh isolated database initialization | **PASS** — created at an isolated path on first SSR request |
| Schema initialization succeeds | **PASS** — 20 tables, 24 triggers, 38 indexes, `schema_version = 1`, all entity tables at 0 rows |
| Tests use isolated storage | **PASS** — resolver returns `:memory:`; no files created |
| Production fixture database remains unchanged | **PASS** — content, size and directory listing identical after `initializeDatabase()` and a repository write |

**Not verified, and not claimed:** browser-level functionality. No browser was driven, no client hydration checked, no user interaction performed. The ~2.5 KB responses are SSR shells.

---

## 4. Remaining Stage 1 Blockers

### 🔴 BLOCKING

**B-1 — The recovery is staged but not committed.** Until a commit is made, `main` still fails a clean clone. This is one `git commit` away, and I did not make it: the instruction was *"Do not commit automatically unless explicitly instructed."*

**B-2 — The working tree is under concurrent modification.** See §5. A commit right now would capture a moving target, and the concurrent work is mid-flight.

### 🟢 NON-BLOCKING

| | Item |
| :--- | :--- |
| N-1 | **9 type errors remain** — 7 in the inert `src/diagnostics/` subsystem (zero importers, unreachable, build passes), 2 in the event contract. Both are documented Stage 1B holds awaiting architecture decisions. |
| N-2 | **19 test files fail to load** — pre-existing hand-rolled scripts predating the Vitest migration, plus one `@/` alias gap in `vitest.config.ts`. The concurrent session appears to be actively fixing these. |
| N-3 | **No `.env.example`; `AKIRA_DATABASE_PATH` undocumented.** `.gitignore` whitelists `!.env.example` but the file does not exist. |
| N-4 | **`npm run dev` still writes to the user's persistent database by default.** Correct for production, risky for development. Changing it alters user data behaviour and needs review. |
| N-5 | **`src/persistence/check_real_db.ts` bypasses the resolver** and opens production directly. Read-only scratch script, no importers, no npm script. |
| N-6 | **`events` table absent from the initialised schema** — created lazily on first publish (Stage 1B CF-7). |
| N-7 | **10 test files retain now-redundant `AKIRA_DATABASE_PATH` assignments.** Harmless — an explicit override still wins. |

### 🟠 ARCHITECTURAL DECISION REQUIRED

| | Decision |
| :--- | :--- |
| D-1 | **Fate of `src/diagnostics/`** — remove as stale, or build `observability/health` + `resources` + `exporters`. Recommended: Option 2 in `stage-1b-diagnostics-investigation.md` §7. Clears 7 errors. |
| D-2 | **Event contract duplicate keys** — clears the final 2 errors. The migration window is open now: the live `events` table holds 1 test row, so renaming is currently free. |
| D-3 | **Production deployment target** — the nitro Cloudflare default cannot load `better-sqlite3`. |
| D-4 | **`npm run dev` database default** (N-4). |

---

## 5. Stop condition triggered — concurrent modification

**I stopped before committing.** Mid-stage, five files were modified by another session; by the end of the stage that had grown to eight, plus a new untracked `src/akira-os/vault/vault-security.test.ts`.

The concurrent work implements the vault deduplication / soft-delete fix (Master Audit DAT-002) and converts hand-rolled test scripts into real Vitest cases. On the dev machine the suite has moved from 42 files / 327 tests to 44 files / 380 tests while this stage was running.

**Why this is a stop condition:** Part C requires certifying a stable repository state. Certifying a tree that is being edited concurrently — and whose concurrent work is incomplete — would produce a green result that does not represent reality, which is the exact failure mode this program exists to eliminate.

### What I did instead

- **Isolated my work from theirs.** All 8 concurrent files are unstaged; verified individually that none is in my staged set. My Part C verification used the staged tree, which carries the `HEAD` version of all of them.
- **Did not stage, revert, or modify any of their files.**

### The one failing test on the dev machine is not mine — proven

```
FAIL src/akira-os/vault/vault.test.ts > Vault Service - Timeline Integration event logging
Error: Event VAULT_FOLDER_CREATED should be published to eventBus -> Expected value to exist, but got null
```

Exonerating evidence: re-running that file with `AKIRA_DATABASE_PATH=":memory:"` set explicitly — which makes branch 1 win and never reaches my new branch — fails **identically** (7 passed, 1 failed).

Root cause: `VaultFolderService` publishes via the **instrumentation** bus (`publish()` at lines 16, 41, 61), while the test subscribes to the **legacy `eventBus`**. This is BND-001, the severed event path documented in `phase-b-event-architecture-reconciliation.md`. The assertion could never pass. It only became visible because the concurrent session converted the file from a non-executing script into real Vitest cases — so it is a **newly-exposed pre-existing defect**, not a regression.

In the staged tree, without the concurrent work, the suite is **337 passed, 0 failed**.

---

## 6. Stage 1C Verdict

# PASS WITH DOCUMENTED LIMITATIONS

**What Stage 1C achieved, verified in a clean isolated environment:**

- **Repository integrity is solved in the index.** The staged tree reproduces a working AKIRA from nothing but `package-lock.json`: `npm ci` → 337 tests passing → build exit 0 → dev server serving HTTP 200 with a correctly initialised database. The Stage 1B blocker (a clean clone producing 103 errors and a failed build) is resolved by content — it now awaits only a commit.
- **The test-database safety defect is fixed at the root, with proof.** The cause was ESM import hoisting, not developer carelessness — the per-file protection pattern used by 10 test files could never have worked. The fix sits at the single existing resolver, needs no per-file cooperation, leaves production resolution byte-identical, and is protected by 10 assertive regression tests. The real database is byte-identical after every run, and a full suite creates no database file anywhere.
- **The forensic loop is closed.** The `evt-async-1` / `tasks-test` row found in the user's live database is traced to `src/analytics/tests/analytics.test.ts:315-319`, and the mechanism that let it through is now closed.

**Why not an unqualified PASS:**

1. **Nothing is committed** (B-1). Reproducibility is measured by what is committed. I hold at staged because the instruction was explicit.
2. **The tree is under concurrent modification** (B-2). I will not certify a moving target.
3. **The type check is not green** (N-1) — 9 errors, both groups documented holds awaiting D-1 and D-2. Nine honest errors, not zero dishonest ones.

**To close Stage 1:** commit the 35 staged files once the concurrent vault work is complete and reviewed, re-run the clean-clone verification against the new `HEAD`, then decide D-1 and D-2 to reach `tsc` = 0.

Every green in §3 was produced in a clean environment, from the lockfile, with an isolated database, and with the user's real data provably untouched.
