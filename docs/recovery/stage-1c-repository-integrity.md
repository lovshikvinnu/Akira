# Stage 1C Part A — Repository Integrity

**HEAD:** `b561730` · **Date:** 2026-09-03
**Objective:** make the committed repository contain the recovery it documents.

---

## 1. The defect

Stage 1B proved that a clean clone of committed `main` reproduces the original P0: 103 TypeScript errors and `vite build` exit 1. Three files created during Stage 1A existed only in the working tree.

```
CURRENT MACHINE                CLEAN CLONE OF main
Files exist          →         Files absent
Build passes                   Build fails
```

---

## 2. The three recovered files — verification (Step A1)

All three were inspected before staging. None was staged merely because it makes the build pass.

### 2.1 `src/genesis/planning/health/createHealthRuleEngine.ts` (7 lines)

```ts
// src/genesis/planning/health/createHealthRuleEngine.ts
import { HealthRuleEngine } from "./HealthRuleEngine";

/** Factory returning a new HealthRuleEngine instance. */
export function createHealthRuleEngine(): HealthRuleEngine {
  return new HealthRuleEngine();
}
```

| Check | Result |
| :--- | :--- |
| Why required | `src/genesis/planning/services/AdaptivePlanningService.ts:7` imports it. That import chain reaches the **client hydration entry** (`genesis/index.ts` → `routes/__root.tsx` → `router.tsx`), which is why its absence failed the whole build. |
| Corresponds to documented Stage 1A recovery | Yes — `phase-a-build-recovery.md` §5.1 / RC-1. Its body was found **already present**, concatenated into `HealthRuleEngine.ts` at lines 51-57, complete with its own path header. This file is a de-concatenation, not new code. |
| Imports resolve | `./HealthRuleEngine` ✅ |
| Exports used | `createHealthRuleEngine` ✅ |
| Placeholders / debug / TODO / suppressions | None |

### 2.2 `src/genesis/planning/health/rules/HealthyRule.ts` (27 lines)

| Check | Result |
| :--- | :--- |
| Why required | `src/genesis/planning/health/HealthRuleEngine.ts:9` imports it and instantiates it in the default rule set. |
| Contract conformance | Implements `HealthRule` exactly: `readonly id`, `readonly priority`, `evaluate(graph): HealthEvaluation \| undefined` ✅ |
| `priority = 5` justified | Siblings occupy 1 (`InactiveRule`), 2 (`CompletedRule`), 3 (`DerivedCompletionRule`), 4 (`StalledRule`). 5 is the only free slot, and matches its position **last** in the engine's default array. |
| `PlanHealthStatus.Healthy` exists | ✅ — `src/genesis/planning/types.ts:12-17` declares `Inactive \| Completed \| Stalled \| Healthy` |
| `ruleId` field correct | ✅ — `HealthEvaluation` declares `ruleId: string` as required (`HealthEvaluation.ts:15`) |
| Behaviour supported by evidence | Engine doc comment: *"If none match, a fallback healthy evaluation is returned"* and *"should never happen because HealthyRule always matches"*. `tests/genesis-planning.test.ts:1442` asserts an Active, blocker-free, empty plan resolves to `"Healthy"`. |
| Placeholders / debug / TODO / suppressions | None. The `_graph` parameter uses the leading-underscore convention for a deliberately unused argument — not a suppression. |

### 2.3 `src/compatibility/adapters/event-adapter.ts` (21 lines)

| Check | Result |
| :--- | :--- |
| Why required | `src/compatibility/core/compatibility-factory.ts:9` imports it and constructs it in `buildCompatibilityContext`. `RuntimeAdapter.events: EventAdapter` is declared in `src/compatibility/interfaces/runtime-adapter.ts:14`. |
| Method surface justified | Fixed by two pre-existing contracts: `SDK EventAPI` (`src/sdk/events/event-api.ts`) calls `publish(name, payload?)` / `subscribe(name, handler)` on this service, and `IModuleEventBus` (`src/runtime/module-context.ts`) declares the same pair. |
| Structural consistency | Identical shape to all 7 sibling adapters — `constructor(private readonly runtimeAdapter: RuntimeAdapter)` plus thin delegating methods. |
| `as any` usage | **2 occurrences — matching the established pattern, not introduced style.** Sibling counts: `storage` 3, `memory` 2, `timeline` 2, `workspace` 2, `analytics` 1, `notification` 1, `search` 1. The casts are forced by the layer's own design: `src/compatibility/interfaces/runtime-adapter.ts:26` declares `export type EventAdapter = any;` along with all seven other adapter types. |
| Placeholders / debug / TODO / suppressions | None |

### 2.4 Automated scan

```
$ grep -E "@ts-ignore|@ts-expect-error|console\.|TODO|FIXME|HACK|XXX|debugger" <all three files>
createHealthRuleEngine.ts   clean
HealthyRule.ts              clean
event-adapter.ts            clean
```

**Verdict: all three justified by repository evidence. No STOP condition triggered.**

---

## 3. Critical discovery — three files are necessary but NOT sufficient

Step A3 verification revealed that Part A as literally scoped does not restore the repository.

The Stage 1A recovery is **33 files**: the 3 new files plus **30 modified tracked files** which were also never committed. Staging only the 3 was tested in isolation (index tree `1c73b244`, exported and installed clean):

| Check | 3 files only | Full 33-file set |
| :--- | :--- | :--- |
| `npm ci` | exit 0 | exit 0 |
| **Type check** | **100 errors** | **9 errors** |
| **Tests** | **1 failed**, 326 passed | **337 passed, 0 failed** |
| Production build | exit 0 | exit 0 |

Why 100 errors remained with only the 3 files:

```
src/genesis/planning/health/HealthRuleEngine.ts(17,14): TS2395 merged declaration must be all exported or all local
src/genesis/planning/health/HealthRuleEngine.ts(46,7):  TS2353 'ruleName' does not exist in type 'HealthEvaluation'
src/genesis/planning/health/HealthRuleEngine.ts(53,10): TS2395 merged declaration ...
src/genesis/planning/health/HealthRuleEngine.ts(53,10): TS2440 Import declaration conflicts with local declaration
```

`HealthRuleEngine.ts` in that tree was still the **concatenated** version — `grep -c "createHealthRuleEngine.ts"` returned 1, i.e. the embedded second module was still present. The de-concatenation lives in the *modified* half of the recovery.

The failing test was `tests/genesis-planning.test.ts:1442` — `expected 'Completed' to be 'Healthy'` — because the `DerivedCompletionRule` empty-plan guard is also in the modified half.

**A notable nuance worth recording:** adding just the 3 files *does* make `vite build` pass (exit 0), because `rolldown` only failed on the unresolved import and does not type-check. So the build alone is not a sufficient integrity signal — the type check is what exposed the incomplete set.

---

## 4. What was staged (Step A2)

`git status` was inspected before every staging operation. Two deliberate decisions:

1. **All 33 Stage 1A files were staged**, not just the 3 new ones. The 30 modified files are not unrelated work — every one is documented in `phase-a-build-recovery.md` §5. They form one atomic recovery; splitting them produces the 100-error state above.
2. **The recovery documentation was left untracked.** Per this stage's instruction it "may remain untracked unless explicitly required by repository conventions", and no convention requires it.

Review of the 30 modified files before staging:

```
$ git diff -U0 | grep "^+" | grep -E "@ts-ignore|@ts-expect-error|debugger|console\.log|TODO|FIXME|HACK|XXX"
  NONE
$ git diff -U0 | grep "^+" | grep -E ": any|as any|<any>"
  NONE ADDED
$ git diff -U0 | grep "^-" | grep -E "as any"
  -      status: "Healthy" as any,        ← one suppression REMOVED
30 files changed, 169 insertions(+), 69 deletions(-)
```

Zero `any` added; one pre-existing `as any` removed.

Two further files were staged for Part B (test database safety, documented separately):
`src/persistence/connection.ts` (modified) and `tests/database-path-safety.test.ts` (new).

**Total staged: 35 files** — 3 new + 30 modified from Stage 1A, plus 2 from Stage 1C Part B.

---

## 5. Clean repository reproduction result (Step A3 / Part C)

Verified against the **staged tree**, exported with `git archive $(git write-tree)` — which contains exactly the staged content and excludes all unstaged work.

```
index tree: fad1e48c1207d69c4bf7ddb51844b1b413b80fc1
files exported: 779          node_modules: absent
```

| Step | Result |
| :--- | :--- |
| `npm ci --no-audit --no-fund` | **PASS** — 484 packages in 32s, from `package-lock.json` alone, exit 0 |
| `npx tsc --noEmit` | **9 errors** — the two documented Stage 1A holds only (7 × `src/diagnostics/`, 2 × `src/contracts/events.ts`). No other error. |
| `npx vitest run` | **PASS** — 24 files passed / 19 fail-to-load (pre-existing); **337 tests passed, 0 failed** |
| `npx vite build` | **PASS** — exit 0 |
| `npx vite dev` + HTTP | **PASS** — `http://localhost:8080`, `/` `/projects` `/settings` all HTTP 200 SSR-rendered; isolated database initialised (20 tables, 24 triggers, 38 indexes, `schema_version = 1`) |

Test count rose from 327 (Stage 1B) to **337** — the 10 new database-safety regression tests. No package version was modified in any environment.

**The staged repository state reproduces a working AKIRA from nothing but the lockfile.**

---

## 6. Concurrent modification discovered mid-stage

While Part B was in progress, **five files were modified by another session**:

```
 M src/akira-os/vault/VaultStorageService.ts
 M src/akira-os/vault/VaultValidationService.ts
 M src/akira-os/vault/vault.test.ts
 M src/contracts/repositories/VaultFileRepository.ts
 M src/persistence/repositories/SqliteVaultFileRepository.ts
```

The diff implements the vault deduplication / soft-delete fix (Master Audit DAT-002) and converts `vault.test.ts` from a non-executing hand-rolled script into real Vitest cases (`function test(name, fn) { it(name, fn) }`). It is **incomplete** — it references a `vault-security.test.ts` that does not exist.

**None of these five files is staged.** Verified individually:

```
VaultStorageService.ts        staged=0
VaultValidationService.ts     staged=0
vault.test.ts                 staged=0
VaultFileRepository.ts        staged=0
SqliteVaultFileRepository.ts  staged=0
```

They remain in the working tree as unstaged modifications, untouched. The Part C verification above deliberately used the staged tree, which carries the `HEAD` version of all five, so the concurrent work-in-progress did not influence any result.

This is reported rather than acted on — see `stage-1c-summary.md` for the stop-condition assessment.
