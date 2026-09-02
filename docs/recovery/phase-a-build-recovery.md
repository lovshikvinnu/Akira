# Phase A — Build Recovery

**HEAD at start:** `f2d8cf6`
**Baseline:** [`phase-a-baseline.md`](phase-a-baseline.md)
**Scope:** restore type-checking and production build. No feature work, no refactoring, no error suppression.

---

## 1. Result

| Check | Baseline | After | Status |
| :--- | ---: | ---: | :--- |
| `npx vite build` | **FAIL** (`UNRESOLVED_IMPORT`) | **PASS** — exit 0; 2,336 + 435 + 2,092 modules across all three environments | ✅ |
| `npx tsc --noEmit` | 103 errors / 39 files | **9 errors / 2 files** | ⚠️ 2 deliberate holds — §6 |
| `npx vitest run` | 22 files passed, 270 tests | **23 files passed, 327 tests** | ✅ +1 file, +57 tests |
| Test files failing to load | 20 | **19** | ✅ all pre-existing class |
| `npx eslint .` | 25 errors + 1 warning | **22 errors + 1 warning** | ✅ below baseline |
| `npm run validate:architecture` | (believed broken) | **PASS — 360/360 assertions** | ✅ see §7 correction |
| Circular dependencies | 5 SCCs (19/7/5/3/2), 3 mutual pairs | **identical** | ✅ none introduced |
| Unresolved imports in `src/` | 19 | **6** | ⚠️ all in one unfinished subsystem |

**The P0 defect is resolved: the production application builds.**

30 files modified, 3 files created. No file deleted. No dependency added or changed.

---

## 2. Root causes

Five distinct root causes account for all 103 baseline errors. Four are mechanical; one is a genuine behavioural defect.

### RC-1 — Multi-file code generated as a single blob (the P0 defect)

`src/genesis/planning/health/HealthRuleEngine.ts` contained **two modules concatenated into one file**. The second carried its own path header at line 51:

```ts
// src/genesis/planning/health/HealthRuleEngine.ts        ← line 1
export class HealthRuleEngine { … }
                                                          ← line 51:
// src/genesis/planning/health/createHealthRuleEngine.ts
import { HealthRuleEngine } from "./HealthRuleEngine";    ← self-import
export function createHealthRuleEngine() { … }
```

This produced 5 errors in one file (`TS2395` ×2 merged-declaration, `TS2440` import-conflicts-with-local, `TS2307`, `TS2353`) and, because `AdaptivePlanningService` imports the factory by its intended path, one unresolvable import on the client hydration path — the build failure.

A second file, `rules/HealthyRule.ts`, was referenced by the engine's default rule set and never emitted at all.

**Git evidence — neither file has ever existed:**
```
$ git log --all --oneline --name-status -- 'src/genesis/planning/health/**'
5297517 feat(genesis): implement Context Intelligence subsystem
A  HealthEvaluation.ts  HealthRule.ts  HealthRuleEngine.ts
A  rules/{Completed,DerivedCompletion,Inactive,Stalled}Rule.ts     ← 7 files, no HealthyRule

$ git log --all -S "createHealthRuleEngine" -- .        → 5297517 only (the broken reference)
$ git rev-list --all --objects | grep -Ei "healthyrule|createhealthruleengine"   → (empty)
```

Recovery from history was therefore impossible; both had to be reconstructed from architectural evidence (§3).

### RC-2 — Wrong relative import depth (13 errors)

Thirteen imports pointed at paths that do not exist while **the target module existed at a different path**. None of these were missing implementations.

| Importer | Wrote | Actual location |
| :--- | :--- | :--- |
| `observability/tracing/trace-service.ts` | `../telemetry-service` | `../services/telemetry-service` + `../services/telemetry-factory` |
| `observability/diagnostics/diagnostics-service.ts` | `../telemetry-service` | `../services/telemetry-factory` |
| `observability/services/abstract-telemetry-service.ts` | `../telemetry-service` | `./telemetry-service` + `./telemetry-factory` |
| `observability/logging/logger.ts` | `./abstract-telemetry-service` | `../services/abstract-telemetry-service` |
| `sdk/core/akira-sdk.ts` | `./core/sdk-context` | `./sdk-context` |
| 3 × `insights/reflection/engine/strategies/*.ts` | `../../../context/assembly/types` | `../../../../context/assembly/types` (4 levels, not 3) |
| 2 × `diagnostics/core/*.ts` | `../interfaces/runtime-adapter` | `../../compatibility/interfaces/runtime-adapter` |

Note the cascade: `logger.ts`'s unresolvable base class caused two further errors (`TS2339` on `.factory` and `.record`) that disappeared once the path was corrected. Four `logger.ts` errors resolved with one path fix.

### RC-3 — Declared contracts narrower than their only implementation and only consumer (21 errors)

| Contract | Gap | Errors |
| :--- | :--- | ---: |
| `IModuleInstance` | omitted `definition`, which `ModuleInstance` declares `public` and `LifecycleManager` reads at 10 sites | 9 |
| `ModuleManifest` + `ModuleManifestSchema` | omitted the 4 per-module lifecycle timeouts `LifecycleManager` reads. Because the schema is a `z.strictObject`, a manifest supplying them was **rejected** — so the feature was unreachable by construction | 4 |
| `SDKContext.PermissionManager` | typed `unknown`, so all 15 `context.permissions.require(...)` calls failed | 15 (of 18 `TS2571`) |
| `IdentityRepository` | omitted `findEvidence`, which `IdentityValidationService` probes for defensively | 2 |
| `HealthEvaluation` | declares `ruleId`; all 5 producers emitted `ruleName` | 5 |
| `PlanningService` | used `PlanAnalysisResult`, `PlanDiagnostics`, `Recommendation` without importing them — all three are exported from `../types` | 5 |
| `reasoning/engine.ts` | used `ReasoningType` without importing it — exported from `./types` | 1 |

### RC-4 — Same name declared by two subsystems with different shapes (5 errors)

`src/genesis/index.ts` re-exported five names via `export *` from two modules each, leaving them ambiguous (`TS2308`) and therefore **unusable through the barrel**:

| Name | Variant A | Variant B |
| :--- | :--- | :--- |
| `GoalStatus` | `identity/types`: 4-value union | `context/goals/types`: 8-value lifecycle |
| `HabitStatus` | `identity/types`: 3-value union | `context/habits/types`: 7-value lifecycle |
| `RelationshipStatus` | `identity/types`: 3-value union | `context/relationships/types`: 6-value lifecycle |
| `GoalCategory` | `identity/types`: 6-value **type alias** | `planning/types`: 8-value **enum** |
| `createDefaultStrategyRegistry` | `insights/reflection/engine`: reflection factory | `reasoning`: reasoning factory |

These are genuinely different domain types sharing a name — a modelling collision, not a typo.

### RC-5 — Stale local test-helper calls and dead config (20 errors)

- `src/analytics/tests/analytics.test.ts`: 19 calls to its own `assertEquals(actual, expected, message)` / `assertExists(value, message)` helpers omitted the required `message`. 89 `assertEquals` and 11 `assertExists` calls in the same file already supplied it — the convention was established and 19 sites drifted.
- `vite.config.ts`: a `test: { }` block containing only a comment. `LovableViteTanstackOptions` has no `test` key; Vitest is configured in `vitest.config.ts`.

---

## 3. Missing-module investigation (Step A2)

For each never-committed module the question was: **is its behaviour recoverable, or would writing it be invention?**

| Module | Recoverable? | Evidence | Action |
| :--- | :--- | :--- | :--- |
| `health/createHealthRuleEngine.ts` | **Yes — content was literally present** | The intended file body, including its path header, sat concatenated at lines 51-57 of `HealthRuleEngine.ts` | De-concatenated verbatim into its own file |
| `health/rules/HealthyRule.ts` | **Yes — behaviour fully pinned** | (a) engine doc: *"If none match, a fallback healthy evaluation is returned"* and *"should never happen because HealthyRule always matches"*; (b) it is **last** in the engine's default rule array, after priorities 1-4; (c) `PlanHealthStatus.Healthy` exists in the enum; (d) 4 sibling rules establish an exact structural template; (e) `tests/genesis-planning.test.ts:1442` asserts an Active, blocker-free, empty plan is `"Healthy"` | Written to the sibling template: `id = "healthy"`, `priority = 5`, always matches |
| `compatibility/adapters/event-adapter.ts` | **Yes — surface fully pinned** | (a) `RuntimeAdapter.events: EventAdapter` is declared; (b) 7 sibling adapters share one rigid shape; (c) `SDK EventAPI` calls exactly `publish(name, payload?)` and `subscribe(name, handler)` on this service; (d) `IModuleEventBus` declares the same pair | Written to the sibling template |
| `diagnostics/health/health-checker.ts` | **No** | `evaluate(report) → { warnings, errors, healthScore }`. A health-scoring algorithm would have to be invented | **Not written** — §6 |
| `diagnostics/performance/performance-monitor.ts` | **No** | Constructed, then never used. Shape unknowable | **Not written** |
| `diagnostics/metrics/metrics-collector.ts` | **No** | Imported and never referenced at all | **Not written** |
| `diagnostics/performance/startup-profiler.ts` | Partially | `markStart()`, `duration()` inferable | **Not written** — would leave the file broken anyway |
| `diagnostics/reporting/diagnostics-exporter.ts` | Partially | `export(report, "json")` — destination unknowable | **Not written** |
| `diagnostics/metrics/event-metrics.ts` | Partially | `record(name)`, `snapshot() → { eventsPerSecond }` — windowing algorithm unspecified | **Not written** |

`src/diagnostics/` was committed in `45f3b5a` as **4 files only**; the `health/`, `performance/`, `reporting/`, `metrics/` and `interfaces/` directories have never existed. It is an unfinished subsystem, not corrupted code — see §6.

---

## 4. Error classification (Step A4)

| Class | Count | Disposition |
| :--- | ---: | :--- |
| `BUILD_BLOCKER` | 1 | Fixed — RC-1 |
| `BROKEN_IMPORT` | 19 | 13 fixed (wrong path, RC-2); 6 held (module never written, §6) |
| `TYPE_CONTRACT_ERROR` | 43 | Fixed — RC-3 (21), RC-4 (5), plus 17 cascade/consequence errors |
| `STALE_CODE` | 19 | Fixed — RC-5 analytics helper arity |
| `TEST_ONLY` | 4 | Fixed — 3 event-store `unknown` payload, 1 metrics CFA narrowing |
| `CONFIGURATION` | 1 | Fixed — dead `test` block in `vite.config.ts` |
| `POSSIBLE_ARCHITECTURAL_ISSUE` | 16 | 14 fixed with documented reasoning (RC-4, timeouts, `PermissionManager`); **2 held for Phase B** (`TASK_CREATED`/`TASK_COMPLETED`) |

---

## 5. Repairs

### 5.1 Files created (3)

| File | Justification |
| :--- | :--- |
| `src/genesis/planning/health/createHealthRuleEngine.ts` | De-concatenation of RC-1. Content is byte-identical to what was embedded in `HealthRuleEngine.ts`, plus a blank line for formatting. |
| `src/genesis/planning/health/rules/HealthyRule.ts` | Terminal rule, `priority = 5`, always returns `PlanHealthStatus.Healthy`. Reconstructed from the five evidence sources in §3. |
| `src/compatibility/adapters/event-adapter.ts` | Two delegating methods matching the 7 sibling adapters and the `SDK EventAPI` call surface. |

### 5.2 Non-trivial fixes

Each entry: **File → Original problem → Root cause → Fix → Why it preserves architecture.**

---

**`src/genesis/planning/health/HealthRuleEngine.ts`**
- *Problem:* 5 errors — merged/duplicate `HealthRuleEngine` declaration, self-import, `TS2307`, `ruleName` unknown property, `status: "Healthy" as any`.
- *Root cause:* RC-1 concatenation.
- *Fix:* truncated the file at the embedded path header; imported `PlanHealthStatus` and replaced `status: "Healthy" as any` with `PlanHealthStatus.Healthy`; renamed the fallback's `ruleName` → `ruleId`.
- *Preserves architecture:* the class body, rule ordering, priority sort and evaluate loop are untouched. Replacing `as any` with the real enum member **removes** an existing suppression rather than adding one.

---

**`HealthEvaluation` contract vs. its 5 producers**
- *Problem:* 5 × `TS2353` — producers emitted `ruleName`, the interface declares `ruleId`.
- *Root cause:* RC-3 contract drift.
- *Fix:* changed the 5 producers to `ruleId`. The interface was **not** changed.
- *Preserves architecture:* the interface is the contract; implementations conform to it, not the reverse. The assigned value is `this.id` from `HealthRule.id`, so `ruleId` names it correctly — and `HealthRule` has no `name` member, making `ruleName` unsourceable. Verified no consumer reads either field (only `evaluation.status` is used), so this is behaviour-neutral.

---

**`src/genesis/planning/health/rules/DerivedCompletionRule.ts` — the one behavioural change in Phase A**
- *Problem:* not a type error. Once the build was restored, `tests/genesis-planning.test.ts` loaded and **1 of 57 tests failed**:
  ```
  AssertionError: expected 'Completed' to be 'Healthy'
    tests/genesis-planning.test.ts:1442
  ```
- *Root cause:* `ProgressService.calculateProgress` returns `percentage = 100` for a plan with no milestones and no tasks — its own comment says `// Empty plan: 100% complete`, a division-by-zero convention for the progress bar. `DerivedCompletionRule` (priority 3) fired on that vacuous 100%, so **every brand-new plan was reported as `Completed`**, pre-empting `HealthyRule` and `StalledRule`.
- *Fix:* one guard — require at least one milestone or task before completion can be *derived*:
  ```ts
  const hasWork = graph.progress.totalTasks > 0 || graph.progress.totalMilestones > 0;
  if (hasWork && graph.progress.percentage === 100) { … }
  ```
- *Preserves architecture:* every rule keeps its priority and status. `ProgressService` is untouched, so progress display is unaffected. The rule's own doc — *"derives completion from the graph's progress metric"* — is honoured: with no work, the metric is vacuous. Verified the 4th assertion still passes (1 milestone + 1 task both `Completed` → 100% with work → `Completed`).
- *Why this was in scope:* the brief scopes Phase A to *"repair only objectively broken implementation"*. A new plan reporting itself complete is objectively broken, it was specified otherwise by 213 committed assertions, and the fix is one line inside the rule that owns the decision. **This is the only change in Phase A that alters runtime behaviour, and it is flagged for your confirmation.**

---

**`src/runtime/module-instance.ts` — `IModuleInstance.definition`**
- *Problem:* 9 × `TS2339`.
- *Root cause:* RC-3.
- *Fix:* added `definition: ModuleDefinition;` to the interface.
- *Preserves architecture:* `ModuleInstance` already declares it `public`, and `LifecycleManager` — typed against the interface — reads it at 10 sites. The interface was strictly narrower than both its only implementation and its only consumer. All 54 runtime tests still pass.

---

**`src/runtime/manifest/manifest.ts` + `manifest-schema.ts` — lifecycle timeouts**
- *Problem:* 4 × `TS2339` on `startupTimeout`, `resumeTimeout`, `pauseTimeout`, `shutdownTimeout`.
- *Root cause:* RC-3, with a second-order trap: `ModuleManifestSchema` is a `z.strictObject`, so declaring the fields on the **type alone** would leave them unusable — a manifest supplying one would be rejected with `UnknownPropertyError`.
- *Fix:* added 4 optional fields to `ModuleManifest` **and** `z.number().int().positive().optional()` to the schema.
- *Preserves architecture:* all optional; `LifecycleManager`'s existing `manifest.X || this.globalDefault` fallback is unchanged, so behaviour for manifests that omit them is identical. This makes a documented capability reachable rather than adding a new one. `tests/manifest.test.ts` (35 assertions, incl. unknown-property rejection) still passes.

---

**`src/sdk/core/sdk-context.ts` — `PermissionManager`**
- *Problem:* 15 × `TS2571` on `this.context.permissions.require(...)`.
- *Root cause:* RC-3 — the type was `unknown`.
- *Fix:* replaced `export type PermissionManager = unknown` with `export interface PermissionManager { require(permissionId: string): void; }`.
- *Preserves architecture:* deliberately narrow — exactly what all 15 call sites use and what `runtime/permissions/permission-manager.ts` implements. **The other 8 service types were left as `unknown`**: giving them real contracts is SDK design work, not build repair (audit DEP-006). `tests/sdk/akira-sdk.test.ts` still passes.

---

**`src/genesis/index.ts` — barrel disambiguation**
- *Problem:* 5 × `TS2308`.
- *Root cause:* RC-4 — genuine domain collisions.
- *Fix:* appended explicit re-exports, which take precedence over `export *`:
  - `GoalStatus`, `HabitStatus`, `RelationshipStatus` → the **context** variants, matching the `goalService` / `habitService` / `relationshipService` the barrel exports beside them. Type-only, so **zero runtime impact**; the identity variants remain available from `./identity/types`.
  - `GoalCategory` → **planning's enum**. This is provably what consumers already resolve to: identity's variant is a type alias with no runtime binding, and `tests/genesis-planning.test.ts` imports `GoalCategory` from the barrel and uses `GoalCategory.Career` successfully.
  - `createDefaultStrategyRegistry` → the **committed Reflection** factory keeps the unprefixed name; the newer Reasoning factory is exposed as `createDefaultReasoningStrategyRegistry`.
- *Preserves architecture:* ambiguous star exports were already excluded, so none of these names was reachable through the barrel before. No existing import changes meaning. **The underlying collision is a modelling issue left for a deliberate decision — see §8.**

---

**`src/diagnostics/core/diagnostics-context.ts` — real initialization bug**
- *Problem:* `TS2729: Property 'runtimeAdapter' is used before its initialization`.
- *Root cause:* `runtimeVersion: string = this.runtimeAdapter.runtimeVersion` as a field initializer. Under `target: ES2022` class-fields semantics, field initializers run **before** parameter properties are assigned, so this would read `undefined` at runtime.
- *Fix:* declared `runtimeVersion: string` and assigned it in the constructor body.
- *Preserves architecture:* public shape unchanged; fixes a genuine runtime defect.

---

**`src/observability/metrics/metrics.test.ts` — control-flow narrowing**
- *Problem:* `TS2339: Property 'metricName' does not exist on type 'never'`.
- *Root cause:* `let writtenRecord: TelemetryRecord | null = null` assigned only inside a sink closure. TypeScript's CFA cannot prove the closure ran, so it narrows the read site to `null`. `metricName` also lives on the concrete `MetricRecord`, not the `TelemetryRecord` base.
- *Fix:* captured through a holder object (`const sinkCapture: { record: TelemetryRecord | null }`), which CFA resets across the intervening `await`, and asserted the concrete `MetricRecord` type.
- *Preserves architecture:* test-local; no `any`.

---

**`src/instrumentation/event-store/tests/event-store.test.ts`**
- *Problem:* 3 × `TS2571` — `AkiraEvent<TPayload = unknown>` makes `.payload` `unknown`.
- *Fix:* narrowed to the concrete shape the test itself constructed, e.g. `(baseline!.payload as { state: string }).state`.
- *Preserves architecture:* production types untouched. Making `EventRepository` generic would be an API change and is out of scope. No `any`.

---

**`src/genesis/insights/reflection/engine/engine.ts`**
- *Problem:* `TS2322: Type 'string' is not assignable to type 'ReflectionType'`.
- *Root cause:* `type: String(item.type || "")` widened an already-correctly-typed value. `ReflectionStrategy.reflect()` returns `readonly Reflection[]`, so `item.type` is **already** `ReflectionType`.
- *Fix:* `type: item.type`. The `String()` wrappers on `id`, `strategyId` and `insight` were kept — those normalise free-text fields, which is the defensive intent.
- *Preserves architecture:* no cast, no `any`; keeps the union type. Narrower than the sibling `reasoning/engine.ts`, which uses a redundant `as ReasoningType`.

---

**`src/genesis/identity/repositories/IdentityRepository.ts`**
- *Problem:* 2 × `TS2339` on `findEvidence`.
- *Root cause:* the method exists in neither the interface nor any implementation, and the call site is already defensive: `this.repository.findEvidence ? this.repository.findEvidence() : []`.
- *Fix:* declared `findEvidence?(): IdentityEvidence[];` — **optional**, with a comment explaining why.
- *Preserves architecture:* behaviour-neutral (still returns `[]`). Implementing it on `InMemoryIdentityRepository` would change validation behaviour — a feature change, not a repair.

---

**`src/observability/tracing/trace-service.ts` — null/undefined boundary**
- *Problem:* `TS2322: Type 'string | null' is not assignable to 'string | undefined'`.
- *Root cause:* two deliberate and different conventions — the trace model uses explicit `parentSpanId: string | null` (agreed across `contracts/telemetry.ts:84`, `models/record.ts:98`, `telemetry-factory.ts:97`), while `TelemetryCorrelation.parentSpanId` is optional.
- *Fix:* converted at the boundary: `parentSpanId: parentSpanId ?? undefined`.
- *Preserves architecture:* both declared contracts are left intact rather than one being bent to the other.

---

### 5.3 Mechanical fixes

| Files | Change |
| :--- | :--- |
| 6 × `src/observability/**` | Corrected relative import paths (RC-2); added the missing `TelemetryValidator` import from `../contracts/telemetry` in 3 validators |
| 3 × `insights/reflection/engine/strategies/*.ts` | `../../../` → `../../../../context/assembly/types` |
| 2 × `src/diagnostics/core/*.ts` | `../interfaces/runtime-adapter` → `../../compatibility/interfaces/runtime-adapter` |
| `src/sdk/core/akira-sdk.ts` | `./core/sdk-context` → `./sdk-context` |
| `src/genesis/planning/services/PlanningService.ts` | Added `PlanAnalysisResult`, `PlanDiagnostics`, `Recommendation` to the existing `../types` import |
| `src/genesis/reasoning/engine.ts` | Added `ReasoningType` to the existing `./types` import |
| `src/analytics/tests/analytics.test.ts` | Supplied the required `message` argument at 19 call sites, matching the file's own convention |
| `vite.config.ts` | Removed the dead `test: { }` block |

### 5.4 Formatting

`npx prettier --write` was run on exactly the files touched above. Lint finished at 22 errors + 1 warning — **below** the 25 + 1 baseline (prettier also cleaned 3 pre-existing nits in `src/genesis/index.ts`). All remaining lint output is `prettier/prettier` formatting in files not touched by this phase.

---

## 6. What was deliberately NOT fixed (9 remaining errors)

Reaching zero would have required violating an explicit instruction. Both holds are stated rather than worked around.

### Hold 1 — `src/contracts/events.ts` (2 errors) — reserved for Phase B

```
src/contracts/events.ts(76,3): TS1117: An object literal cannot have multiple properties with the same name.
src/contracts/events.ts(77,3): TS1117: ...
```

`TASK_CREATED` and `TASK_COMPLETED` are each declared twice (lines 6/7 as `task.*`, lines 76/77 as `planning.task.*`), and the later declaration silently wins.

**Phase B Step B4 states: _"Do not rename it during this phase."_** `TS1117` cannot be resolved without renaming or removing a key, so it is left untouched. It is investigated in full in [`phase-b-event-architecture-reconciliation.md`](phase-b-event-architecture-reconciliation.md) §6.

### Hold 2 — `src/diagnostics/core/diagnostics-manager.ts` (7 errors) — unfinished subsystem

6 × `TS2307` for modules that have never existed, plus `TS2693` (`DiagnosticError` — an *interface* from `diagnostics-report.ts` — used as a constructor; note `diagnostics-errors.ts` exports a similarly-named `DiagnosticsError` **class**, requiring a `message`).

Every available route is blocked by an explicit rule:

| Option | Blocked by |
| :--- | :--- |
| Write the 6 modules | *"Do not begin new features"* / *"Do not invent functionality"* — 3 of 6 are un-inferable (§3), and `HealthChecker` would need an invented scoring algorithm |
| Delete `src/diagnostics/` | *"Do not delete features"* |
| `@ts-ignore` / `any` / `exclude` | *"Do not disable TypeScript checks"*, *"Do not suppress errors through compiler configuration"* |

The file has **zero inbound imports**, is not on the build path, and contains explicit placeholder markers (`moduleCount: 0, // placeholder`, and `const err = new DiagnosticError();` — an unused assignment inside an empty `catch`). Fabricating six modules to satisfy it would create exactly the false-capability pattern the Master Audit flagged (QUA-004).

**This needs your decision — see §8.**

---

## 7. Correction to the Master Audit

The Master Audit stated that `scripts/validate-architecture.ts` had 5 unresolved imports and could not run. **That was wrong.** The five `../akira-os/*` strings are literals inside `storeSource.includes('import("../akira-os/projects")')` assertions — the script inspects source text for those import statements. My graph analyser's regex matched `import("…")` inside string literals.

Verified: `npx tsx scripts/validate-architecture.ts` runs and reports **360/360 assertions passed**. The script's real imports (lines 5-7) were always correct. The audit's separate point — that the script validates SQLite migration behaviour rather than architecture boundaries, so its name is misleading — still stands.

---

## 8. Decisions needed from you

Phase A is complete on its objective. Three items are recorded rather than decided:

1. **`DerivedCompletionRule` guard (§5.2)** — the only behavioural change in Phase A. Please confirm that an empty Active plan should report `Healthy` rather than `Completed`. The committed test asserted `Healthy`; the committed rule produced `Completed`. I followed the test.

2. **`src/diagnostics/` (§6)** — finish the 6 missing modules, or remove the subsystem? It has no consumers and 7 outstanding errors. Until one is chosen, `tsc` cannot reach zero.

3. **Name collisions (RC-4)** — `GoalStatus`, `HabitStatus`, `RelationshipStatus`, `GoalCategory` each model different domains under one name, and two subsystems both export `createDefaultStrategyRegistry`. Phase A made the barrel usable without renaming anything. Renaming per subsystem (e.g. `IdentityGoalStatus` vs `CognitiveGoalStatus`) would be the durable fix.

---

## 9. Architecture impact

**No architectural boundary was changed.**

| Boundary | Status |
| :--- | :--- |
| Layer dependency directions | Unchanged. No new cross-layer edge; the measured cross-directory edge set is unchanged apart from the 3 new intra-layer files. |
| Circular dependencies | **Identical to baseline** — 5 SCCs of sizes 19/7/5/3/2 and the same 3 mutual pairs. None introduced, none removed. |
| Event architecture | **Untouched.** No bus, bridge, subscription, publisher or event constant was modified. |
| `contracts/` | Only `IdentityRepository` gained an optional method. `events.ts` untouched. |
| Public barrels | `src/genesis/index.ts` gained explicit re-exports that made 5 previously-unreachable names reachable. No existing import changed meaning. |
| Runtime contracts | `IModuleInstance` and `ModuleManifest` were **widened** to match their existing implementation and consumer. No narrowing. |
| SDK | `PermissionManager` gained a minimal interface. The other 8 service types remain `unknown` by choice. |
| Persistence / schema | Untouched. |
| GENESIS pipeline semantics | Unchanged except the single documented `DerivedCompletionRule` guard. |
| Dependencies | `package.json` and `package-lock.json` untouched. |
| Compiler / lint config | `tsconfig.json` and `eslint.config.js` untouched. `vite.config.ts` lost only a dead no-op block. |

### Suppression audit

| Prohibited action | Used? |
| :--- | :--- |
| Disabled a TypeScript check | No — `tsconfig.json` untouched, `strict: true` retained |
| Added `any` to silence an error | No — and one pre-existing `as any` was **removed** (`HealthRuleEngine` fallback) |
| Added `@ts-ignore` / `@ts-expect-error` | No — zero in the diff |
| Removed failing code to make the build pass | No — no file deleted; the only removal was a no-op config block |
| Deleted a feature | No |
| Suppressed via compiler configuration | No |
| Changed unrelated architecture | No |

### Verification commands

```bash
npx tsc --noEmit                        # 9 errors, both holds documented in §6
npx vite build                          # exit 0
npx vitest run                          # 23 files passed, 327 tests passed
npx eslint .                            # 22 errors + 1 warning (all prettier; below baseline)
npx tsx scripts/validate-architecture.ts # 360/360 passed
```

**Recommended next step, independent of Phase B:** add `"typecheck": "tsc --noEmit"` and change `"test"` to `"vitest run"` in `package.json`, then wire both into CI. Phase A's root causes were all long-lived and individually trivial; they persisted only because nothing ever reported them.
