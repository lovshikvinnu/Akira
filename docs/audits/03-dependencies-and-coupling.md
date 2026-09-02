# 03 — Dependency & Coupling Audit

Severity scale: `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `INFORMATIONAL`.
Findings already stated in `02-architecture-boundaries.md` are cross-referenced, not repeated.

---

## 1. Unresolved imports — 19 in `src/`, 6 more in `scripts/`

These specifiers point at files that do not exist. Every one is a build-time or runtime failure waiting on the first import.

| Importer | Missing specifier | Consequence |
| :--- | :--- | :--- |
| `src/genesis/planning/services/AdaptivePlanningService.ts:7` | `../health/createHealthRuleEngine` | **Breaks `vite build` and 1 test file** — CRITICAL, see DEP-001 |
| `src/genesis/planning/health/HealthRuleEngine.ts:9` | `./rules/HealthyRule` | Same module, second missing file |
| `src/genesis/insights/reflection/engine/strategies/ContradictionReflectionStrategy.ts:1` | `../../../context/assembly/types` | Type-only; elided at runtime |
| `…/ObservationReflectionStrategy.ts:1` | same | Type-only |
| `…/PatternReflectionStrategy.ts:1` | same | Type-only |
| `src/sdk/core/akira-sdk.ts:1` | `./core/sdk-context` (should be `./sdk-context`) | Type-only; SDK does not typecheck |
| `src/observability/services/abstract-telemetry-service.ts:1` | `../telemetry-service` | Value import — would throw |
| `src/observability/tracing/trace-service.ts:2` | `../telemetry-service` | Value import |
| `src/observability/diagnostics/diagnostics-service.ts:2` | `../telemetry-service` | Value import |
| `src/observability/logging/logger.ts:10` | `./abstract-telemetry-service` | Value import |
| `src/compatibility/core/compatibility-factory.ts:9` | `../adapters/event-adapter` | Value import |
| `src/diagnostics/core/diagnostics-context.ts:1` | `../interfaces/runtime-adapter` | Value import |
| `src/diagnostics/core/diagnostics-manager.ts:1,3,4,5,6,8,9` | `../interfaces/runtime-adapter`, `../health/health-checker`, `../performance/performance-monitor`, `../performance/startup-profiler`, `../reporting/diagnostics-exporter`, `../metrics/metrics-collector`, `../metrics/event-metrics` | 7 missing modules in a 104-line file |
| `scripts/validate-architecture.ts` | `../akira-os/{projects,tasks,notes,sessions,settings}` (5) | Wrong relative depth; `npm run validate:architecture` cannot run |

`src/routes/__root.tsx → ../styles.css?url` also appears unresolved to the analyser; this is a legitimate Vite asset query and is **not** a defect.

---

## DEP-001 — CRITICAL — Two files were never created; their contents were concatenated into a third

**Finding:** `src/genesis/planning/health/HealthRuleEngine.ts` is 57 lines long and contains **two modules pasted into one file**. The tail of the file carries its own path header:

```ts
// src/genesis/planning/health/HealthRuleEngine.ts     ← line 1
import { HealthyRule } from "./rules/HealthyRule";     ← line 9, file does not exist
export class HealthRuleEngine { … }
…
// src/genesis/planning/health/createHealthRuleEngine.ts   ← line 51, inside the same file
import { HealthRuleEngine } from "./HealthRuleEngine";     ← self-import
export function createHealthRuleEngine(): HealthRuleEngine { … }
```

**Evidence:**
- `git ls-files src/genesis/planning/` confirms neither `createHealthRuleEngine.ts` nor `rules/HealthyRule.ts` has **ever** been committed; the breakage exists at `HEAD`, not in the dirty working tree.
- `git show HEAD:src/genesis/planning/services/AdaptivePlanningService.ts` line 7 already contains the broken import.
- `tsc` reports on this one file: `TS2307` (missing `HealthyRule`), `TS2395` ×2 and `TS2440` (merged/duplicated `HealthRuleEngine` declaration), `TS2353` (`ruleName` not in `HealthEvaluation`).
- `npx vite build` → `[UNRESOLVED_IMPORT] Could not resolve '../health/createHealthRuleEngine'`.

**Risk:** the application does not build. Because the import chain runs through `src/genesis/index.ts` → `src/routes/__root.tsx` → client hydration entry, **no production client bundle can be produced at all** from the current `main`.

**Root cause:** a code-generation step that emitted multiple files as one blob, committed without ever running `tsc` or `vite build` (there is no CI to catch it — see TST-001).

**Fix complexity:** trivial (split the file, add `HealthyRule`). **Detection complexity:** the real problem is that nothing detects it.

---

## DEP-002 — CRITICAL — `HealthEvaluation` field contract disagrees with all five of its producers

**Finding:** `src/genesis/planning/health/HealthEvaluation.ts:15` declares the field `ruleId: string` (required). Every producer emits `ruleName` instead.

**Locations:** `HealthRuleEngine.ts:46`, `rules/CompletedRule.ts:21`, `rules/DerivedCompletionRule.ts:23`, `rules/InactiveRule.ts:23`, `rules/StalledRule.ts:23` — five `TS2353` errors.

**Risk:** every `HealthEvaluation` produced at runtime is missing the field consumers are typed to read (`evaluation.ruleId` → `undefined`) and carries an undeclared one. Plan-health provenance is unusable.

---

## DEP-003 — HIGH — Global mutable singletons with silent-null fallbacks (service-locator anti-pattern)

Three global registries hold process-wide mutable state set by import-time side effects:

| Registry | State | Failure contract |
| :--- | :--- | :--- |
| `src/contracts/workspace-provider.ts:12` | `let activeWorkspaceProvider` | `getWorkspaceProvider()` **throws** if unset |
| `src/shared/genesis-provider.ts:13-14` | `let storeProvider`, `let companionStateProvider` | `getMemories()`/`getChat()` return `[]`, `saveMemory()` **silently no-ops**, `getCompanionState()` returns `null` |
| `src/genesis/memory/memory-service.ts:13` | `let rebuildRecallIndexCallback` | `buildRecallIndex()` silently no-ops if unset |

**Risk:** the two contracts are *inconsistent* — one fails loudly, the other fails invisibly. `saveMemory()` returning `void` on an unregistered provider means GENESIS event persistence can fail completely with no signal anywhere. Combined with import-order dependence (BND-004), whether a provider is registered before first use is not guaranteed by anything.

**Additional consequence:** because state is module-scoped, no two instances can coexist. Test files must import in a specific order and cannot reset cleanly — this is why `tests/personal-declarations.test.ts` must manually call `validationEngine.initialize(); memoryService.initialize();` in a `beforeEach`.

---

## DEP-004 — HIGH — `CompanionStateService.bootstrap()` is a god-object entry point and is invoked twice

**Finding:** `src/genesis/context/state/service.ts:37-41` — a *state* service owns the initialisation of the *memory* pipeline:

```ts
public bootstrap(snapshot?: AwarenessSnapshot): CompanionState {
  validationEngine.initialize();
  recallBuilder.initialize();
  memoryService.initialize();          // ← triggers full memory reconstruction
  identityFoundationService.initialize();
  …
}
```

**Call sites:** `src/routes/__root.tsx:248` and `src/routes/chat.tsx:596`.

**Non-idempotence evidence:** `bootstrap()` contains no guard. Each call re-runs `memoryService.initialize()` → `reconstructRuntimeMemory()`, re-publishes `state_initialized`, records a fresh event via `eventService.record(...)`, and re-subscribes to the store (the store subscription *is* guarded at line 245, the rest is not).

**Risk:** navigating to `/chat` re-bootstraps the entire cognitive layer mid-session, resetting companion state and emitting a duplicate synthetic event (see GEN-003).

---

## DEP-005 — HIGH — The SDK erases all error information from the platform boundary

**Finding:** every method of every SDK API wraps the *delegation* in `try/catch` and rethrows `PermissionRequiredError`, regardless of the actual cause.

**Location:** `src/sdk/storage/storage-api.ts`, `memory/memory-api.ts`, `timeline/timeline-api.ts`, `events/event-api.ts`, `search/search-api.ts`, `workspace/workspace-api.ts`, `analytics/analytics-api.ts`, `notifications/notification-api.ts` — the identical shape appears 16 times:

```ts
async get(key: string): Promise<any> {
  this.context.permissions.require("storage.read");
  try {
    return await (this.context.storage as any).get(key);
  } catch (e) {
    throw new PermissionRequiredError("storage.read");   // ← swallows the real error
  }
}
```

**Risk:** a disk error, a corrupt row, a network timeout or a null dereference inside any platform service is reported to the module author as "permission required". Module developers will be sent to debug permissions for faults that have nothing to do with them. This is the single worst error contract in the codebase.

**Why tests miss it:** `tests/sdk/akira-sdk.test.ts` injects one `MockService` that implements every method of every service and **never throws** (lines 13-60), so the catch branch is never exercised despite 19 assertions.

---

## DEP-006 — HIGH — The SDK has no type contracts

**Finding:** `src/sdk/core/sdk-context.ts:24-32` defines every service as `unknown`:

```ts
export type WorkspaceService = unknown;
export type StorageService = unknown;
export type TimelineService = unknown;
export type AnalyticsService = unknown;
export type MemoryService = unknown;
export type SearchService = unknown;
export type NotificationService = unknown;
export type EventBus = unknown;
export type PermissionManager = unknown;
```

Consequently all 16 SDK methods cast through `as any`, producing 18 `TS2571` "Object is of type 'unknown'" errors. The same 3-line explanatory comment block is duplicated verbatim (lines 21-23 and 24-26) — a copy-paste artifact.

**Risk:** the "Platform SDK" advertises a stable versioned surface (`SDK_VERSION`, `SDKVersionMismatchError`) over a completely untyped interior. A module cannot be compile-checked against the platform, so `sdkVersion` semver checking in the manifest system provides no actual compatibility guarantee.

---

## DEP-007 — MEDIUM — Duplicate abstractions: three loggers, two event buses, two error toolkits

| Concept | Implementations | Consumers |
| :--- | :--- | :--- |
| Logger | `src/lib/logger.ts` (82 LOC) | `src/routes/brain.tsx` only |
| | `src/shared/infrastructure/logger/index.ts` (82 LOC) — **byte-identical** | `runtime/lifecycle-manager.ts`, `runtime/runtime-manager.ts` |
| | `src/observability/logging/logger.ts` (155 LOC) — the ADR-021 "official" one | **nobody**; has 4 type errors |
| Event bus | `src/shared/infrastructure/event-bus/index.ts` (`SimpleEventBus`, string topics + `"*"`) | presence, runtime, GENESIS |
| | `src/instrumentation/event-bus.ts` (`EventBus`, typed `AkiraEvent` + subscriber objects) | store, vault, analytics, event store |
| Error toolkit | `src/lib/{error-capture,error-page,lovable-error-reporting}.ts` | `src/server.ts`, `src/routes/__root.tsx`, `src/start.ts` |
| | `src/shared/error/{error-capture,error-page,lovable-error-reporting}.ts` — **byte-identical** | nobody |
| `cn()` utility | `src/lib/utils.ts` (fan-in 43) | app, components, routes |
| | `src/shared/utilities/utils.ts` — **byte-identical** | nobody |

`diff` confirms byte-identity for all four duplicated pairs.

**Risk:** a fix applied to one copy silently misses the other. The runtime layer logs through a *different* logger than the rest of the app, so runtime diagnostics never reach `brain.tsx`'s log viewer.

---

## DEP-008 — MEDIUM — Encapsulation bypassed to inspect event-bus internals

**Location:** `src/instrumentation/server/index.ts:19-22`

```ts
const subsArray = Array.from((globalEventBus as any).subscribers || []);
for (const sub of subsArray) {
  if ((sub as any).id === "persistence-subscriber") { hasPersistence = true; break; }
}
```

**Risk:** `EventBus.subscribers` is `private`. The server RPC reaches into it on every single event to decide whether to lazily register subscribers. Renaming or changing that field silently disables event persistence (the loop simply finds nothing, and re-registers a duplicate subscriber on every call — see DAT-003). `EventBus` already exposes `hasSubscriber()`; it is not used.

`src/runtime/lifecycle/lifecycle-manager.ts:217,251` does the same for the capability registry: `(instance.context.runtime as any)?.capabilityRegistry`, a member absent from the `IRuntimeManager` interface.

---

## DEP-009 — MEDIUM — Broken interface contract in the runtime module model

**Finding:** `IModuleInstance` (`src/runtime/module-instance.ts:6-18`) does not declare `definition`, yet `LifecycleManager` reads `instance.definition.{startup,shutdown,pause,resume}` at 10 sites (lines 209, 210, 232, 246, 247, 260, 261, 273, 274 + capability registration at 231).

**Evidence:** 10 × `TS2339: Property 'definition' does not exist on type 'IModuleInstance'`. It works today only because the concrete `ModuleInstance` class happens to declare it `public`.

**Risk:** the lifecycle manager is typed against an interface but coded against a class. Any alternative `IModuleInstance` implementation — the entire point of the interface — crashes.

---

## DEP-010 — MEDIUM — Dead configuration path: per-module lifecycle timeouts are unreachable by design

**Finding:** `LifecycleManager` reads `instance.manifest.startupTimeout`, `.resumeTimeout`, `.pauseTimeout`, `.shutdownTimeout` (lines 213, 250, 264, 277). None of these fields exists on `ModuleManifest` (`src/runtime/manifest/manifest.ts`), and `ModuleManifestSchema` (`src/runtime/manifest/manifest-schema.ts`) is a **`z.strictObject`** — so a manifest that declared them would be *rejected* with `UnknownPropertyError`.

**Evidence:** 4 × `TS2339: Property 'startupTimeout' does not exist on type 'ModuleManifest'`.

**Risk:** all four expressions evaluate to `undefined`, so every module silently falls back to the global default. A module can never be granted a longer startup budget. The feature reads as implemented and is not.

---

## DEP-011 — MEDIUM — `src/genesis/index.ts` re-exports colliding names

**Finding:** 5 × `TS2308` ambiguous re-exports because `export *` is used across subsystems with overlapping type names:

| Colliding name | Sources |
| :--- | :--- |
| `GoalStatus` | `./identity/types` and `./context/goals/types` |
| `HabitStatus` | `./identity/types` and `./context/habits/types` |
| `RelationshipStatus` | `./identity/types` and `./context/relationships/types` |
| `GoalCategory` | `./identity/types` and `./planning/types` |
| `createDefaultStrategyRegistry` | `./insights/reflection/engine` and `./reasoning` (or `./decision`) |

**Risk:** which definition a consumer gets is resolution-order dependent. `GoalStatus` meaning two different things in the identity model and the goals engine is a genuine domain-modelling collision, not just a naming nit. The last one is a *value* collision, so it can produce wrong runtime behaviour, not just wrong types.

---

## DEP-012 — MEDIUM — `PlanningService` references five undeclared type names

**Location:** `src/genesis/planning/services/PlanningService.ts:398, 414, 419, 423, 427` — `PlanAnalysisResult`, `PlanDiagnostics`, `Recommendation` (×3) are used without being imported or defined (`TS2304`). The file has 28 outbound imports and is 436 lines; `Recommendation` *is* exported from `../types` but is not imported here.

Similar: `src/genesis/reasoning/engine.ts:49` uses `ReasoningType` undeclared; `src/genesis/insights/reflection/engine/engine.ts:45` assigns a bare `string` to `ReflectionType`; `src/genesis/identity/services/IdentityValidationService.ts:102` calls `repository.findEvidence(...)`, a method absent from the `IdentityRepository` interface.

**Risk:** `PlanningService` is the most-imported planning module (fan-out 28, re-exported from `genesis/index.ts`). Its public method return types are `any` by accident, so no consumer is checked.

---

## DEP-013 — LOW — Name collision between a server-only service and its client proxy

`src/akira-os/vault/VaultStorageService.ts` exports `VaultStorageService` (server-only; throws at module load in the browser). `src/akira-os/vault/services/index.ts` exports a *different* object also named `VaultStorageService` (a client RPC proxy), and that one is what `src/akira-os/vault/index.ts` re-exports.

Two objects with the same name, the same method names and completely different execution semantics live two directories apart. `import { VaultStorageService } from "../VaultStorageService"` and `from "./services"` behave differently. Understandable convention, real hazard.

---

## DEP-014 — INFORMATIONAL — Fan-out hotspots worth watching

| Module | LOC | Fan-out | Note |
| :--- | ---: | ---: | :--- |
| `src/routes/brain.tsx` | 2,106 | 24 | Largest file in the repo; a route component reaching directly into 24 subsystems |
| `src/routes/chat.tsx` | 1,610 | 19 | Calls `companionStateService.bootstrap()` directly (DEP-004) |
| `src/persistence/akira-store.ts` | 928 | 42 | Single writer for all workspace state + 17 event publishes + 2 global provider registrations |
| `src/genesis/identity/services/IdentityService.ts` | 827 | 18 | Initialises 14 sibling services with a shared repository |
| `src/genesis/index.ts` | 135 | 61 | Barrel; forces the whole cognitive layer into every consumer's graph |

None of these is a defect on its own. Together they mean there is no place in the system where a subsystem can be swapped, mocked, or lazily loaded.

---

## Coupling health summary

| Dimension | Assessment |
| :--- | :--- |
| Circular imports | 5 SCCs; one is 19 files spanning 3 layers (BND-005). Router cycle is benign. |
| Service-locator abuse | 3 global registries, 2 with silent-null contracts (DEP-003) |
| Global mutable state | Pervasive: every GENESIS service is a module-scope singleton with module-scope arrays |
| Dependency inversion | Interfaces exist (`EventRepository`, `AnalyticsRepository`, `IdentityRepository`, `PlanRepository`, `IModuleInstance`) but are routinely violated (DEP-009, DEP-012) or bypassed (DEP-008) |
| God objects | `akira-store.ts`, `brain.tsx`, `IdentityService.ts`, `CompanionStateService.bootstrap()` |
| Duplicate abstractions | 4 byte-identical file pairs; 3 loggers; 2 event buses (DEP-007) |
| Unresolved imports | 19 in `src/`, 6 in `scripts/` |

**What is well-factored and should be left alone:** `src/akira-os/*/{services,server}` — the client-facade / server-RPC split is consistent across all 8 feature modules and cleanly keeps `better-sqlite3` off the client. `src/contracts/repositories/*` — 11 clean interfaces with `Sqlite*` implementations behind them. `src/runtime/manifest/*` — proper zod schema, semver validation, typed error hierarchy.
