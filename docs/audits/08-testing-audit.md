# 08 — Testing Audit

This is a risk-based assessment, not a count. Numbers appear only where they support a claim.

---

## Measured baseline

```
npx vitest run

 Test Files  20 failed | 22 passed (42)
      Tests  270 passed (270)
   Duration  4.59s
```

**Read that carefully: 20 of 42 test files do not execute a single test, and the run reports "270 passed" with no failures.** `vitest` exits non-zero, but nothing in the repository checks the exit code.

| Category | Files | Tests executed | Assertions |
| :--- | ---: | ---: | ---: |
| `tests/*.test.ts` (vitest-native, GENESIS + runtime) | 20 | 269 | ~600 |
| `tests/sdk/akira-sdk.test.ts` | 1 | ~11 | 19 |
| `src/observability/*.test.ts` | 2 | ~41 | 78 |
| **`tests/genesis-planning.test.ts`** | 1 | **0** | 213 written, 0 run |
| **`src/**/*.test.ts` (hand-rolled, AKIRA OS)** | **18** | **0** | **0** |
| Total | 42 | 270 | — |

---

## TST-001 — CRITICAL — There is no automated quality gate of any kind

**Evidence:**
- `.github/` contains exactly one file: `CODEOWNERS`. No workflows.
- `.git/hooks/` contains only `*.sample` files.
- `package.json` scripts: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`, `test`, `validate:architecture`. **No `typecheck`.**
- `npm run test` runs bare `vitest` — **watch mode**, not `vitest run`. It never terminates and therefore can never gate anything.
- `npm run lint` reports only formatting (QUA-001).
- `npm run validate:architecture` cannot execute: `scripts/validate-architecture.ts` has 5 unresolved imports (`../akira-os/{projects,tasks,notes,sessions,settings}` — wrong relative depth).

**Consequence, demonstrated:** commit `f2d8cf6` is on `main` with a build that fails, 103 type errors, and the largest GENESIS test suite unable to load. All three were introduced by committed code and none was detected.

This is the highest-leverage finding in the entire audit. Every other testing weakness below is downstream of it.

---

## TST-002 — CRITICAL — 18 test files in `src/` are hand-rolled scripts that assert nothing under vitest

**Finding:** every `*.test.ts` under `src/` except the two observability files implements its own micro-framework and never uses `describe`/`it`/`expect`. `vitest` collects them (they match the default `**/*.test.ts` glob), finds no suite, and reports `Error: No test suite found in file …`.

**Evidence** — `src/akira-os/vault/vault.test.ts:26-50`:
```ts
const totalTests = 0;
const passedTests = 0;
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { tests.push({ name, fn }); }
function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message} -> Expected …, got …`);
}
function assertExists(value: any, message: string) { … }
function assertThrows(fn: () => void, expectedMessagePart: string, message: string) { … }
```
Note also that `totalTests` and `passedTests` are `const` and initialised to `0` — the file's own pass/fail counters can never be incremented. These scripts do not report correctly even when run standalone.

**Assertion census** — `expect(` occurrences per file:

| File | LOC | `describe`/`it` | `expect(` |
| :--- | ---: | ---: | ---: |
| `src/analytics/tests/analytics.test.ts` | 1,227 | 17 (its own `test()`) | **0** |
| `src/instrumentation/event-store/tests/event-store.test.ts` | 427 | 10 | **0** |
| `src/persistence/vault-db.test.ts` | 387 | 7 | **0** |
| `src/akira-os/vault/vault.test.ts` | 333 | 8 | **0** |
| `src/akira-os/search/search.test.ts` | 289 | 12 | **0** |
| `src/instrumentation/tests/instrumentation.test.ts` | 227 | 6 | **0** |
| `src/akira-os/timeline/timeline.test.ts` | 218 | 4 | **0** |
| `src/akira-os/tools/tools.test.ts` | 185 | 7 | **0** |
| `src/akira-os/presence/presence.test.ts` | 172 | 6 | **0** |
| `src/instrumentation/tests/integration.test.ts` | 162 | 2 | **0** |
| `src/instrumentation/tests/ordering.test.ts` | 151 | 2 | **0** |
| `src/app/ui/timeline/timeline-performance.test.ts` | 149 | 2 | **0** |
| `src/components/vault/vault-feature.test.tsx` | 152 | 6 | **0** |
| `src/components/vault/vault-ui.test.tsx` | 239 | 3 | **0** |
| `src/app/ui/timeline/timeline-rendering.test.ts` | 125 | 3 | **0** |
| `src/instrumentation/tests/fault-injection.test.ts` | 122 | 2 | **0** |
| `src/instrumentation/tests/validation.test.ts` | 106 | 9 | **0** |
| `src/instrumentation/tests/benchmark.test.ts` | 95 | 0 | **0** |
| `src/app/ui/timeline/timeline-interaction.test.ts` | 54 | 1 | **0** |

**Total: 4,230 lines of test code producing zero assertions.**

**Which subsystems are therefore completely unverified:**

| Subsystem | Intended coverage (file) | Actual |
| :--- | :--- | :--- |
| Event Store (persistence, queries, ordering) | `event-store.test.ts` (427 LOC) | none |
| Event Bus, middleware, publisher | `instrumentation.test.ts`, `validation.test.ts` | none |
| **Event ordering** | `ordering.test.ts` | none — and PLT-006 is a real ordering defect |
| **Fault injection / failure isolation** | `fault-injection.test.ts` | none — and REL-005 is a real swallowing defect |
| Instrumentation ↔ Timeline integration | `integration.test.ts` | none |
| Analytics engine, calculators, rebuild, consistency | `analytics.test.ts` (1,227 LOC) | none — and PLT-014/015/016 are real defects |
| Vault storage, hashing, validation, dedup | `vault.test.ts`, `vault-db.test.ts` | none — and DAT-002/003 are real data-loss defects |
| Universal search + FTS | `search.test.ts` | none |
| Timeline repository + UI | `timeline.test.ts`, 3 UI test files | none — and DAT-004 is a real data-loss defect |
| Presence Engine | `presence.test.ts` | none — and REL-004 is a real amplification risk |
| Tool registry | `tools.test.ts` | none |
| Vault UI components | 2 `.tsx` files | none |

**Every single AKIRA OS platform defect in this audit sits in a subsystem whose test file cannot run.** The tests were written to cover exactly these areas; they simply never execute.

**Two independent secondary causes of failure in the same set:**
1. `src/app/ui/timeline/timeline-interaction.test.ts` fails with `Cannot find package '@/app/shell/Shell'` — `vitest.config.ts` does not load a tsconfig-paths plugin, so the `@/` alias is unresolvable in tests. Confirmed independently during this audit: an isolated probe using `@/runtime/...` failed and the same probe with a relative path passed.
2. `src/analytics/tests/analytics.test.ts` additionally has 19 `TS2554` arity errors, so it is out of date with the code it tests even as a script.

---

## TST-003 — CRITICAL — The largest GENESIS suite executes zero tests

`tests/genesis-planning.test.ts` — 1,533 lines, 81 `describe`/`it` blocks, 213 `expect(` calls — fails at import:

```
FAIL tests/genesis-planning.test.ts
Error: Cannot find module '../health/createHealthRuleEngine'
  imported from src/genesis/planning/services/AdaptivePlanningService.ts
 ❯ src/genesis/planning/services/PlanningService.ts:39:1
```

So the entire Planning Foundation — plans, milestones, tasks, dependencies, blockers, progress, recommendations, goal decomposition, plan health — has **no verification at HEAD**, despite having the most test code of any GENESIS capability. See DEP-001.

---

## TST-004 — HIGH — No test exercises the wiring, only the units

**Finding:** the 270 passing tests are exclusively unit tests over pure logic. Nothing tests how subsystems are connected — which is precisely where every critical defect in this audit lives.

Concrete gaps, each mapped to an undetected defect:

| Untested integration | Undetected defect |
| :--- | :--- |
| Does an `akira-store` mutation reach GENESIS? | **BND-001** — it does not |
| Does `Events.TASK_COMPLETED` equal `"task.completed"`? | **BND-002** — it does not |
| Does `getInitialState()` return memories? | **GEN-002** — `memories: []` hard-coded |
| Does `saveMemory` reach the database? | **GEN-002** — it writes to an in-memory array |
| Do memories survive a simulated restart? | **GEN-002** — nothing survives |
| Does the app build? | **DEP-001** — it does not |
| Does `resolveSafePath("../Vault_x/y")` throw? | **SEC-003** — it does not (a test asserts only the `../../` case) |
| Does soft-deleting a deduplicated file break its sibling? | **DAT-002** — it does |
| Does `findBetween` return a stable order for same-ms events? | **PLT-006** — it does not |
| Does the rebuild bucket days the same way the query layer does? | **PLT-014** — it does not |
| Does a failed workspace write surface an error? | **DAT-001** — it does not |
| Does `permissionManager.require` deny an ungranted permission? | **PLT-019** — there is no grant model |

**Zero restart / recovery tests exist.** `grep -rn -i "restart\|recover\|reconstruct" tests/*.test.ts` returns only "Simulated … crash" strings, which are all *strategy-level* failure-isolation tests inside a single engine — valuable (see below) but not recovery tests.

---

## TST-005 — HIGH — Test-environment isolation is fragile and order-dependent

**Cause:** `getDatabaseConnection()` (`src/persistence/connection.ts:26`) caches a module-level singleton on first call. `AKIRA_DATABASE_PATH` is read only inside that first call.

The hand-rolled tests set the env var at module top level *before* importing the connector:
```ts
// src/akira-os/vault/vault.test.ts:1-9
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
process.env.AKIRA_VAULT_PATH = path.join(process.cwd(), "src", "persistence", "VaultTest");
import { initializeDatabase } from "../../persistence/initializer";
```
This works only while each file runs in its own module registry. Any change to vitest's `isolate`/`pool` settings, or a shared-worker configuration, and the first file to run wins the database for the whole process.

**Additional problems:**
- **Three different test-database strategies coexist:** `:memory:` (vault test), `src/persistence/temp_e2e_akira.db` (documented in `TESTING.md`, committed to git along with its `-wal`/`-shm`), and `src/persistence/temp_test_phase2.db` (`scripts/validate-architecture.ts`).
- `src/akira-os/vault/vault.test.ts` writes real files into `src/persistence/scratch/VaultTest/Temp/` — inside the source tree.
- `closeDatabaseConnection()` does not undo `connection.ts`'s `db.prepare` monkey-patch (DAT-006), so cross-test connection reuse carries state.
- `vitest.config.ts` points `setupFiles` at `src/testing/setup.ts`, whose entire content is `// removed during modernization`. The root `setup.ts` — which mocks `process.exit` and is referenced by the config's own comment ("This adds a setup file that mocks process.exit") — is **not** loaded. The stated purpose of the setup file is unmet.

---

## TST-006 — MEDIUM — Excessive mocking hides the defect it should catch

**Case study:** `tests/sdk/akira-sdk.test.ts` (19 assertions) injects a single `MockService` class implementing `read`, `write`, `get`, `set`, `delete`, `append`, `query`, `track`, `readMemory`, `writeMemory`, `search`, `send` — every method of all eight distinct services — plus a `MockPermissionManager` whose `require()` merely records the string.

Consequences:
1. **`MockService` never throws**, so the catch branch that converts every error into `PermissionRequiredError` (DEP-005, 16 sites) is never executed. The single worst error contract in the codebase passes its own test suite.
2. **`MockPermissionManager.require()` always succeeds**, so no test can distinguish "permission checked" from "permission enforced" — which is exactly the gap in the real `PermissionManager` (PLT-019).
3. One mock satisfying eight unrelated interfaces means no test verifies that `MemoryAPI` talks to the memory service rather than to storage.

**Elsewhere, mocking is used well:** `tests/lifecycle.test.ts` (12 `vi.fn`) and `tests/genesis-identity.test.ts` (84 `vi.fn`) use spies to assert *interactions*, which is the right use.

---

## TST-007 — MEDIUM — Assertion strength is uneven

113 occurrences of low-information assertions (`toBeDefined()`, `toBeTruthy()`, `not.toThrow()`, `expect(true).toBe(true)`) across the suite, concentrated in:

| File | `toBeDefined()` |
| :--- | ---: |
| `tests/genesis-identity.test.ts` | 43 |
| `tests/genesis-planning.test.ts` | 32 (not executing) |
| `tests/personal-declarations.test.ts` | 14 |
| `tests/runtime.test.ts` | 4 |
| `tests/manifest.test.ts` | 3 |

`toBeDefined()` on a factory result confirms only that a function returned something. In `genesis-identity.test.ts` (1,205 LOC, 236 assertions) it accounts for 18% of all assertions.

By contrast the newest suites are notably stronger — see below.

---

## TST-008 — MEDIUM — Version labels in tests contradict the stated roadmap

`describe(...)` titles in `tests/` claim:

| Version | Suites |
| :--- | :--- |
| v2.21 | `genesis-context-assembly`, `genesis-context-intelligence`, `genesis-relevance-engine` |
| v2.22 | `genesis-reflection-{assembly,engine,generation}` |
| v2.23 | `genesis-reasoning-{engine,generation,assembly}` |
| v2.24 | `genesis-decision-engine` |

The audit brief states **"v2.19 — IDENTITY — NEXT"**, and `src/genesis/identity/README.md` is labelled `(v2.19)`. Work through v2.24 is committed and tested. Either the roadmap or the test labels is wrong; both cannot be authoritative. See `12-documentation-audit.md` DOC-004.

---

## TST-009 — LOW — Coverage tooling is installed and unreachable

`@vitest/coverage-v8@^4.1.10` is a devDependency. There is no `test:coverage` script, no `coverage` block in `vitest.config.ts`, and no threshold configuration. `TESTING.md` §5 documents `npm run test:coverage`, `npm run test:watch` and `npm run test:ui` — **none of which exist** in `package.json`.

Coverage numbers are therefore unknown, and would be misleading in any case while 20 files fail to load.

---

## TST-010 — LOW — A benchmark masquerades as a test

`src/instrumentation/tests/benchmark.test.ts` is collected by `vitest`, prints a formatted results table to stdout, and contributes 0 tests. Its output *is* useful (it is the only real performance measurement in the repository — see `10-performance-audit.md`), but it runs on every `vitest` invocation, adds ~3 s, writes 61,000 rows to a SQLite database, and reports no pass/fail. It belongs behind a separate script.

---

## Risk-based coverage assessment

Ranked by (business criticality × probability of silent failure) ÷ current coverage.

| Rank | Area | Criticality | Coverage today | Verdict |
| ---: | :--- | :--- | :--- | :--- |
| 1 | AKIRA OS → GENESIS event wiring | Highest — the product's core claim | **none** | Untested; broken (BND-001) |
| 2 | GENESIS cross-session persistence | Highest — "REMEMBER" | **none** | Untested; not implemented (GEN-002) |
| 3 | Build / typecheck integrity | Highest — gates everything | **none** | Untested; broken (DEP-001) |
| 4 | Workspace write durability | Highest — user data | **none** | Untested; unsafe (DAT-001) |
| 5 | Vault dedup + delete/restore | High — irreplaceable files | file exists, 0 assertions | Untested; data-loss bug (DAT-002) |
| 6 | Event Store ordering & persistence | High — source of truth | file exists, 0 assertions | Untested; ordering defect (PLT-006) |
| 7 | Analytics rebuild correctness | High — derived data | 1,227-LOC file, 0 assertions | Untested; UTC/local split (PLT-014) |
| 8 | Timeline durability | Medium-high | file exists, 0 assertions | Untested; silent data sink (DAT-004) |
| 9 | RPC input validation | Medium-high | none | Untested; 40/41 no-ops (PLT-001) |
| 10 | Permission enforcement | Medium (high for modules) | mocked to always pass | Untested; no grant model (PLT-019) |
| 11 | Module loading / sandboxing | Medium (high for modules) | `runtime.test.ts` covers happy paths | Partially tested; unsandboxed (PLT-020) |
| 12 | Search + FTS correctness | Medium | file exists, 0 assertions | Untested |
| 13 | Presence engine | Medium | file exists, 0 assertions | Untested; amplification risk (REL-004) |
| 14 | GENESIS reasoning/decision/reflection engines | Medium | **good** (see below) | Well tested |
| 15 | Manifest / resolver / capability registry | Medium | **good** | Well tested |
| 16 | Identity subsystem | Medium | broad but assertion-weak | Adequately tested |
| 17 | UI components | Low-medium | 5 files, 0 assertions | Untested |

---

## What the test suite does well

These parts are genuinely good and should be treated as the template for fixing the rest.

| Suite | Why it is strong |
| :--- | :--- |
| `tests/genesis-reflection-generation.test.ts` (249 LOC, 27 assertions) | Registers a deliberately crashing strategy and asserts the engine **omits** the failing strategy's output without inserting placeholders — a real failure-isolation contract, precisely asserted. |
| `tests/genesis-reasoning-{engine,generation,assembly}.test.ts` | Same discipline: crash isolation, ordering preservation, instance-identity assertions (`expect(result.items[0]).toBe(reflections[0])` proves no defensive copying), and `expect(Object.keys(result)).toEqual(["items"])` pinning the exact output shape. |
| `tests/genesis-decision-engine.test.ts` (42 assertions) | Strategy-crash isolation plus registry behaviour. |
| `tests/genesis-relevance-engine.test.ts` (43 assertions) | Same pattern, applied to relevance scoring. |
| `tests/genesis-context-intelligence.test.ts` | Simulates a provider crash and asserts the collection records an error context rather than dropping it. |
| `tests/lifecycle.test.ts` (31 assertions, 12 spies) | Asserts state-machine transitions and hook invocation order with spies — correct use of mocking. |
| `tests/manifest.test.ts` (415 LOC, 35 assertions) | Exercises invalid manifests, bad semver, unknown properties, duplicate ids/capabilities/routes against the typed error hierarchy. |
| `tests/dependency-resolver.test.ts` (33 assertions) | Missing dependencies, cycles, and deterministic startup/shutdown ordering. |
| `tests/capability-registry.test.ts` (29 assertions) | Multi-provider registration, version-range resolution, priority selection. |
| `tests/context-relevance.test.ts` (33 assertions) | Pins the relevance-filtering behaviour that GEN-007 identifies as string-fragile — the best existing guard on that logic. |
| `src/observability/{telemetry,metrics/metrics}.test.ts` (78 assertions) | The only `src/`-located tests written in real vitest, and the only reason the observability layer has any verification at all. |
| Immutability discipline | The newer GENESIS suites use `Object.freeze` on fixtures and assert instance reuse — a habit that catches accidental mutation, and one the production code should adopt (GEN-005). |

**The gap is not skill. It is enforcement.** The engineering standard visible in `tests/genesis-reasoning-*.test.ts` is high; the problem is that 4,230 lines of AKIRA OS test code were written in a pre-vitest idiom, never migrated, and no gate ever reported that they stopped counting.
