# Stage 1C Part B — Test Database Safety

**HEAD:** `b561730` · **Date:** 2026-09-03
**Objective:** guarantee that no test or validation command can silently write to the user's persistent AKIRA database.

---

## 1. The original defect

`getDatabasePath()` fell back to the user's persistent database whenever `AKIRA_DATABASE_PATH` was unset. Tests attempted to protect themselves by assigning that variable at the top of the module — a pattern that **cannot work in ESM**.

Direct evidence of a production write, found in the live `%APPDATA%\AKIRA\akira.db` during Stage 1B:

```json
{ "id": "evt-async-1", "type": "task.created", "source": "tasks-test",
  "payload_json": "{\"id\":\"task-201\",\"title\":\"Async Task\",\"projectId\":\"proj-async\"}" }
```

Forensic match, exact and unambiguous — `src/analytics/tests/analytics.test.ts:315-319`:

```ts
id: "evt-async-1",
source: "tasks-test",
payload: { id: "task-201", title: "Async Task", projectId: "proj-async" },
```

A test wrote into the user's real database. This is a confirmed defect, not a theoretical risk.

---

## 2. Database path architecture (Step B1)

### 2.1 Actual resolution chain

```
process.env.AKIRA_DATABASE_PATH  (explicit override)
            │
            ▼
getDatabasePath()                 src/persistence/connection.ts:12   ← SINGLE RESOLVER
            │  fallback: %APPDATA%/AKIRA/akira.db  or  ~/.akira/akira.db
            │            (and mkdir -p on that directory)
            ▼
getDatabaseConnection()           src/persistence/connection.ts
            │  • caches a module-level singleton  `dbInstance`
            │  • applies PRAGMAs (WAL, foreign_keys, busy_timeout, auto_vacuum)
            │  • monkey-patches db.prepare for search-cache invalidation
            ▼
better-sqlite3 Database handle
            │
            ├──► initializeDatabase()          src/persistence/initializer.ts
            ├──► 11 Sqlite*Repository classes  src/persistence/repositories/
            ├──► SqliteAnalyticsRepository     src/analytics/repository/
            ├──► SqliteEventRepository         src/instrumentation/event-store/
            ├──► Vault services                src/akira-os/vault/
            └──► analytics validation          rebuild-manager, consistency-checker,
                                               analytics-validator, benchmark
```

**Good news for the fix:** `getDatabasePath()` is the single choke point. 36 files reach the database, and every one of them goes through `getDatabaseConnection()`.

### 2.2 The one resolver bypass

`src/persistence/check_real_db.ts:4-6` opens the production database directly:

```ts
const dbPath = path.join(process.env.APPDATA || "", "AKIRA", "akira.db");
const db = new Database(dbPath);
```

It is a read-only inspection scratch script with **zero importers and no npm script**, so it is not part of the command surface. Recorded, not changed — deleting it is outside Stage 1C scope.

### 2.3 Root cause — ESM import hoisting

Ten test files used this pattern:

```ts
process.env.AKIRA_DATABASE_PATH = ":memory:";   // line 1
process.env.NODE_ENV = "test";                  // line 2

import { getDatabaseConnection } from "../../persistence/connection";  // line 4
...
import { DiagnosticsService } from "../validation/diagnostics";        // line 26
```

**In ESM, every `import` declaration is hoisted and its module graph fully evaluated *before* any statement in the importing module's body runs.** So line 26 executes before line 1.

And `src/analytics/validation/diagnostics.ts:86` opens the database at module scope:

```ts
export const diagnosticsService = new DiagnosticsService();
//  → constructor: new SqliteAnalyticsRepository()
//  → constructor: this.db = db || getDatabaseConnection()
//  → getDatabasePath() reads AKIRA_DATABASE_PATH — STILL UNSET
//  → falls back to %APPDATA%/AKIRA/akira.db  ← PRODUCTION
//  → cached in `dbInstance`
```

`src/persistence/repositories/index.ts:26-36` does the same thing eleven times over:

```ts
export const projectRepository = new SqliteProjectRepository();   // ×11 singletons
```

By the time line 1 assigns `:memory:`, the production handle is already cached in `dbInstance`, and `getDatabasePath()` is never consulted again. **The per-file protection pattern is structurally incapable of working.**

### 2.4 Measured exposure

A transitive import-graph analysis (BFS from every test file to `src/persistence/connection.ts`) found:

| Category | Count |
| ---: | :--- |
| Reach the DB connector and set `AKIRA_DATABASE_PATH` (self-protected — but see §2.3) | 10 |
| **Reach the DB connector and set nothing at all** | **17** |
| No DB reach | 15 |
| Total | 42 |

The 17 unprotected files:

```
src/akira-os/presence/presence.test.ts          tests/genesis-reasoning-assembly.test.ts
src/app/ui/timeline/timeline-interaction.test.ts tests/genesis-reasoning-engine.test.ts
src/instrumentation/event-store/tests/event-store.test.ts  tests/genesis-reasoning-generation.test.ts
src/instrumentation/tests/instrumentation.test.ts          tests/intent-resolution.test.ts
tests/capability-registry.test.ts               tests/lifecycle.test.ts
tests/dependency-resolver.test.ts               tests/manifest.test.ts
tests/genesis-decision-engine.test.ts           tests/personal-declarations.test.ts
tests/genesis-identity.test.ts                  tests/runtime.test.ts
tests/genesis-planning.test.ts
```

Compounding factor: `process.env` is process-global and persists across test files sharing a Vitest worker, so which database a given file received was **non-deterministic**, depending on execution order.

---

## 3. Command census (Step B2)

| Command | Intended environment | Database access | Safety before | Safety after |
| :--- | :--- | :--- | :--- | :--- |
| `npm run test` (`vitest`, watch) | Test | Yes — 27 of 42 files reach the connector | ⚠️ **UNSAFE** — 17 files had no override; the other 10 were defeated by ESM hoisting | ✅ **SAFE** — resolver returns `:memory:` |
| `npx vitest run` | Test | Same | ⚠️ **UNSAFE** | ✅ **SAFE** |
| `npm run validate:architecture` | Validation (writes) | Yes — `initializeDatabase()`, `executeMigration()`, 360 assertions | ✅ Safe — sets `AKIRA_DATABASE_PATH` to `src/persistence/temp_test_phase2.db` inside `setupTestDb()`, a **runtime** call (not module scope), and calls `closeDatabaseConnection()` first, which resets the singleton | ✅ Unchanged |
| `npm run dev` (`vite dev`) | Development | Yes — SSR entry calls `initializeDatabase()` | ⚠️ Writes to the user's persistent DB by default | ⚠️ **Unchanged by design** — see §5.3 |
| `npm run build` / `build:dev` | Build | No | ✅ Safe | ✅ Unchanged |
| `npm run preview` | Preview | Not verified | — | Unchanged |
| `npm run lint` / `format` | Tooling | No | ✅ Safe | ✅ Unchanged |
| `node src/persistence/check_real_db.ts` | Dev scratch (read-only) | **Bypasses the resolver** — opens production directly | ⚠️ By design (named `check_real_db`); no npm script, no importers | ⚠️ Unchanged, recorded |
| `node src/persistence/check_temp_db.ts` | Dev scratch (read-only) | Opens `src/persistence/temp_e2e_akira.db` | ✅ Isolated | ✅ Unchanged |
| CI configuration | — | — | **None exists** (`.github/` contains only `CODEOWNERS`) | Unchanged |

---

## 4. The fix (Steps B3 / B4)

### 4.1 Design constraints honoured

- Persistence layer **not** redesigned. No second database system introduced.
- No hardcoded developer path.
- Change confined to the **single existing resolver**, `getDatabasePath()`.
- Production resolution left byte-identical.
- No `@ts-ignore`, no `@ts-expect-error`, no `any`, no silent catch.

### 4.2 Environment signals — verified, not assumed

Probed with a throwaway Vitest test (removed immediately after):

```
VITEST           = "true"
VITEST_WORKER_ID = "0"
VITEST_POOL_ID   = "1"
NODE_ENV         = "test"
AKIRA_DATABASE_PATH = undefined
```

Both `VITEST` and `NODE_ENV=test` are set by Vitest in every worker process, requiring **no cooperation from individual test files** — which is precisely what §2.3 proves is unobtainable.

### 4.3 The change — `src/persistence/connection.ts`

```ts
/**
 * Isolated database used whenever code runs under a test runner without an
 * explicit AKIRA_DATABASE_PATH. Each connection gets its own private database,
 * so parallel workers cannot corrupt one another and nothing is left on disk.
 */
export const TEST_DATABASE_PATH = ":memory:";

/**
 * True when running under a test runner.
 *
 * Vitest sets both `VITEST` and `NODE_ENV=test` in every worker process, so this
 * requires no cooperation from individual test files. That matters: a test file
 * cannot protect itself by assigning `process.env.AKIRA_DATABASE_PATH` at the top
 * of the module, because ESM evaluates all `import` declarations *before* any
 * statement in the module body — and several imported modules open the database
 * at module scope (e.g. `persistence/repositories/index.ts`,
 * `analytics/validation/diagnostics.ts`). The assignment therefore lands after the
 * connection has already been resolved and cached.
 */
const isTestEnvironment = (): boolean =>
  process.env.VITEST === "true" || process.env.NODE_ENV === "test";

export const getDatabasePath = (): string => {
  // 1. An explicit override always wins — production, development, and any test
  //    that deliberately wants a real file on disk.
  if (process.env.AKIRA_DATABASE_PATH) {
    return process.env.AKIRA_DATABASE_PATH;
  }

  // 2. Under a test runner, never fall back to the user's persistent database.
  if (isTestEnvironment()) {
    return TEST_DATABASE_PATH;
  }

  // 3. Production / development default: the user's persistent database.
  const appDataDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, "AKIRA")
    : path.join(os.homedir(), ".akira");

  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }

  return path.join(appDataDir, "akira.db");
};
```

Net diff: **one modified file**, +30 lines (23 of them documentation), 0 removed.

### 4.4 Why `:memory:` rather than a temp file

| Requirement | How `:memory:` satisfies it |
| :--- | :--- |
| No production writes from tests by default | The production branch is unreachable under a test runner |
| No test requires the user's existing database | Every test starts from an empty schema |
| Tests work from a clean environment | Verified in a fresh clone with `npm ci` — 337 passed |
| Temp databases must not survive unintentionally | Nothing is written to disk at all — no cleanup step to forget |
| Parallel tests must not corrupt each other | `:memory:` is **private per connection**; two workers resolving the same string still get two independent databases. No file to contend for. |
| Consistent with existing architecture | It is exactly what the 10 self-protected test files already chose |

A per-worker temp file (`akira-test-$VITEST_WORKER_ID.db`) was considered and rejected: it needs cleanup, leaves artifacts on failure, and adds a filesystem dependency the tests do not need.

---

## 5. Backward compatibility

### 5.1 Production / user runtime — unchanged

Branch 3 is byte-identical to the previous implementation, including the `mkdirSync` side effect. `VITEST` is never set in production, and `NODE_ENV=test` in production would be a misconfiguration in its own right.

**Verified:** the real `%APPDATA%\AKIRA\akira.db` is byte-identical after every Stage 1C test run —

```
BEFORE  md5=75c2c9422467c053586db7bb02fc4208  size=1753088  mtime=Jul 25 21:23
AFTER   md5=75c2c9422467c053586db7bb02fc4208  size=1753088  mtime=Jul 25 21:23
```

No `-wal` / `-shm` sidecars appeared, which would have indicated the file was opened at all.

### 5.2 Explicit overrides — unchanged and now documented

`AKIRA_DATABASE_PATH` still takes precedence over everything, including test isolation. This is deliberate: `scripts/validate-architecture.ts` depends on it, and a test that needs a real file on disk opts in by naming one. Two regression tests pin this behaviour.

### 5.3 Development — deliberately unchanged

`npm run dev` still resolves to the user's persistent database. Changing that would alter user data behaviour and, per this stage's stop conditions, requires explicit architectural review. It is recorded as a **non-blocking documentation gap**: there is no `.env.example` (though `.gitignore` whitelists one) and no repository file documents `AKIRA_DATABASE_PATH`.

### 5.4 Existing tests — no dependency on production data

Stop condition #3 was explicitly tested. After the fix, the full suite in a clean environment reports **337 passed, 0 failed** — 327 pre-existing plus the 10 new safety tests. No test lost its data source, which confirms none was relying on the user's database for its assertions.

---

## 6. Regression tests added (Step B5)

`tests/database-path-safety.test.ts` — **10 tests, all with real assertions.** Deliberately written in real Vitest (`describe`/`it`/`expect`), not the hand-rolled print-only pattern that produces 0 assertions elsewhere in this repository.

Each test snapshots and restores `AKIRA_DATABASE_PATH`, `APPDATA`, `NODE_ENV` and `VITEST`, calls `closeDatabaseConnection()` in `afterEach`, and uses `fs.mkdtempSync` fixtures — **never the user's real database.**

### Test isolation (6)

| Test | Asserts |
| :--- | :--- |
| resolves to the isolated test database when no override is set | `getDatabasePath() === ":memory:"` |
| never resolves to a persistent user database path under the test runner | With `APPDATA` repointed at an isolated fixture: result does not contain `akira.db`, does not start with the production dir, and is not an absolute path |
| resolves to a non-filesystem target, so parallel workers cannot contend for one file | `=== ":memory:"`, `fs.existsSync(resolved) === false`, not absolute |
| does not create the production application-data directory | Fixture `AKIRA/` dir absent before **and after** calling `getDatabasePath()` — proves the early return precedes `mkdirSync` |
| still isolates when only `NODE_ENV` signals a test environment | `VITEST` deleted, `NODE_ENV=test` → `:memory:` |
| still isolates when only `VITEST` signals a test environment | `NODE_ENV` deleted, `VITEST=true` → `:memory:` |

### Explicit override behaviour (2)

| Test | Asserts |
| :--- | :--- |
| honours an explicit `AKIRA_DATABASE_PATH`, which takes precedence over test isolation | Returns the named path verbatim |
| honours an explicit in-memory override | Returns `":memory:"` |

### Production preservation (2)

| Test | Asserts |
| :--- | :--- |
| leaves an existing production-location database byte-identical while the DB stack runs | Creates a sentinel file at `<fixture>/AKIRA/akira.db`, repoints `APPDATA`, then runs `getDatabaseConnection()` + `initializeDatabase()`. Asserts the isolated DB really works (`projects` table exists), and that the fixture's content, size **and directory listing** are unchanged — no `-wal`/`-shm` sidecars, proving it was never opened. |
| writes nothing to the production location even after repository writes | Same setup, then `projectRepository.add(...)`. Asserts the row is readable from the isolated database **and** the fixture still contains only `SENTINEL` with no new files. |

```
$ npx vitest run tests/database-path-safety.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### End-to-end isolation evidence

After a full suite run in a clean environment, no database file was created anywhere in the tree:

```
$ find . -path ./node_modules -prune -o -name "*.db*" -print
./src/persistence/temp_e2e_akira.db        ← committed artifact, present at checkout
./src/persistence/temp_e2e_akira.db-shm    ← committed artifact
./src/persistence/temp_e2e_akira.db-wal    ← committed artifact
```

No `~/.akira/`, no `APPDATA/AKIRA/`, and every `mkdtempSync` fixture cleaned up by `afterEach`.

---

## 7. What was NOT changed, and why

| Item | Reason |
| :--- | :--- |
| The 10 test files that set `AKIRA_DATABASE_PATH` at module top | Now redundant but harmless — an explicit override still wins. Removing 10 lines across hand-rolled scripts that will be rewritten anyway (Master Audit CRIT-007) is churn, not safety. |
| `src/persistence/check_real_db.ts` | Read-only scratch script, no importers, no npm script. Deleting it is outside Stage 1C scope. |
| `scripts/validate-architecture.ts` | Already isolated correctly, and verified still passing 360/360. Its temp DB lands inside the source tree, which is untidy but not a safety defect. |
| `npm run dev` production default | Changing user data behaviour requires architectural review (§5.3). |
| The `dbInstance` singleton | Caching is load-bearing across the persistence layer. The fix works at resolution time, before caching, so no change was needed. |
| `vitest.config.ts` / `src/testing/setup.ts` | A `setupFiles` env assignment would have been the wrong layer — it cannot protect a script run outside Vitest, and it repeats the mistake of relying on ordering. The resolver is the correct choke point. |
