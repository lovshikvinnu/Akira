# 11 — Code Quality & Technical Debt

Focus: maintainability and future risk. Stylistic preferences are excluded — `prettier` is configured and the codebase is uniformly formatted.

---

## QUA-001 — HIGH — The lint gate is configured to detect nothing but formatting

**Measured result of `npx eslint .`:**
```
TOTAL errors 25 warnings 1
BY RULE: [["prettier/prettier", 25], ["(parse)", 1]]
```
**Every single reported problem is a formatting nit.** Not one is a code-quality issue, because `eslint.config.js` explicitly disables every rule that would find one:

```js
"react-refresh/only-export-components": "off",
"react-hooks/exhaustive-deps":          "off",
"@typescript-eslint/no-unused-vars":    "off",
// then, scoped to src/**:
"@typescript-eslint/no-explicit-any":   "off",
"no-empty":                             "off",
// and re-disabled again for src/sdk/**, tests/**, src/runtime/**
```

`tsconfig.json` completes the picture:
```json
"noUnusedLocals": false,
"noUnusedParameters": false,
```

**Consequences, measured:**
- `grep -rn ": any\|as any\|<any>" src | wc -l` → **371** occurrences of `any`, none reported.
- 66 files with zero inbound imports (QUA-003), none reported.
- 26 empty or error-discarding `catch` blocks (REL-005), none reported.
- `react-hooks/exhaustive-deps` off means the `__root.tsx` boot-order race (GEN-013) and every stale-closure bug class is unchecked.

**Risk:** the project has a lint step that always looks almost-green, which is worse than having none — it creates confidence that no static analysis is actually providing. Combined with the absence of CI (TST-001) and the absence of a `typecheck` script, nothing in the repository distinguishes healthy code from broken code.

The one genuinely valuable custom rule is the `no-restricted-properties` ban on `process.exit` in `src/**` — that one works and should stay.

---

## QUA-002 — HIGH — Zero debt markers in a codebase with substantial incomplete work

```
grep -rn -E "TODO|FIXME|HACK|XXX" src   →   0 matches
```

Not one marker, across 373 files and 64,224 lines — while the codebase contains:

| Incomplete work | Marked? |
| :--- | :--- |
| `src/diagnostics/` — 7 of its imports point at files that do not exist | No |
| `src/observability/` — 34 files, 12 type errors, zero consumers | No |
| `src/compatibility/` — 15 files, 1 missing import, zero consumers | No |
| `PermissionManager.require()` — performs no authorization (SEC-005) | No |
| `manifest.startupTimeout` etc. — read but undeclarable (DEP-010) | No |
| `store-init.ts` — `memories: []` hard-coded (GEN-002) | No |
| `compileSnapshotFromStore` — 3 fields permanently `[]` (GEN-010) | No |
| `src/testing/setup.ts` — content is `// removed during modernization` | Sort of |
| `PlanningService` — 5 undeclared type names (DEP-012) | No |

**Interpretation:** this is the signature of code that was generated in large blocks rather than written incrementally. Incomplete work reads as finished work. There is no in-code signal telling a future maintainer (human or agent) which parts are load-bearing and which are scaffolding, so every audit has to be done from first principles — as this one was.

**This is the most consequential quality finding after the missing CI.** A `TODO(owner): not wired — see ADR-021` on the observability barrel would have saved most of the effort spent establishing QUA-004 below.

---

## QUA-003 — HIGH — 66 files have zero inbound imports

Measured from the full import graph (2,020 edges), excluding entry points, route files, and test files.

### Dead duplicates — byte-identical to a used file (4 files)
| Dead | Live twin | `diff` |
| :--- | :--- | :--- |
| `src/shared/utilities/utils.ts` | `src/lib/utils.ts` (fan-in 43) | identical |
| `src/shared/error/error-capture.ts` | `src/lib/error-capture.ts` | identical |
| `src/shared/error/error-page.ts` | `src/lib/error-page.ts` | identical |
| `src/shared/error/lovable-error-reporting.ts` | `src/lib/lovable-error-reporting.ts` | identical |

Plus `src/shared/infrastructure/logger/index.ts`, byte-identical to `src/lib/logger.ts` — this one *is* imported (by the runtime layer), which is worse: two identical loggers with two different consumer sets (DEP-007).

### Dead subsystem barrels and orphaned managers (7 files)
`src/analytics/index.ts`, `src/analytics/tests/index.ts`, `src/compatibility/index.ts`, `src/compatibility/core/compatibility-factory.ts`, `src/diagnostics/core/diagnostics-manager.ts`, `src/diagnostics/core/diagnostics-errors.ts`, `src/sdk/index.ts`, `src/sdk/permissions/permission-api.ts`, `src/observability/events/index.ts`, `src/observability/runtime-visibility.ts`, `src/instrumentation/subscribers/index.ts`.

### Dead GENESIS barrels (11 files)
`context/{goals,habits,initiative,knowledge,relationships,state}/index.ts`, `importance/index.ts`, `memory/relationships/index.ts`, `recall/index.ts`, `stories/index.ts` — all bypassed because `src/genesis/index.ts` re-exports the underlying services directly.

### Committed dev scratch scripts inside the source tree (4 files)
`src/persistence/check_real_db.ts`, `check_temp_db.ts`, `validate_migration.ts`, `validateMigration.ts`.
Note the last two: **two files differing only in case**, both tracked, plus a third copy at `scripts/validate_migration.ts`. On a case-insensitive filesystem (macOS default, Windows) a checkout of both is ambiguous.

### shadcn/ui primitives never used (36 files)
`src/app/ui/{accordion,alert-dialog,alert,aspect-ratio,avatar,badge,breadcrumb,calendar,card,carousel,chart,checkbox,collapsible,command,context-menu,dropdown-menu,form,hover-card,input-otp,menubar,navigation-menu,pagination,popover,progress,radio-group,resizable,select,sidebar,slider,switch,table,tabs,textarea,toggle-group}.tsx` and `src/components/vault/{ErrorState,LoadingState}.tsx`.

**Assessment:** these 36 are **not debt** — they are a design-system library installed as a unit, and the corresponding `@radix-ui/*` packages are already in `package.json`. Removing them would be churn. They are listed only so they are not mistaken for the real dead code above.

### Other (3 files)
`src/workers/thumbnail-worker.ts` (referenced by string URL, not by import — verify before touching), `src/testing/setup.ts`, `src/genesis/context/...` barrels counted above.

**Actionable dead code: ~26 files.** The 36 UI primitives and the worker should be left alone.

---

## QUA-004 — HIGH — Three fully-built subsystems are documented, broken, and connected to nothing

| Subsystem | Files | LOC | Docs | Type errors | Production consumers |
| :--- | ---: | ---: | :--- | ---: | ---: |
| `src/observability/` | 34 | 3,242 | 11 architecture docs + ADR-021 | 12 (incl. 4 missing modules) | **0** |
| `src/diagnostics/` | 4 | 182 | referenced as "Runtime Diagnostics" pillar | 8 (7 missing modules) | **0** |
| `src/compatibility/` | 15 | 332 | referenced as "Compatibility Layer" pillar | 1 missing module | **0** |

`docs/AKIRA-OS/architecture/observability/` contains `OBSERVABILITY_ARCHITECTURE.md`, `TELEMETRY_CORE.md`, `TELEMETRY_MODEL.md`, `METRICS_ENGINE.md`, `OBSERVABILITY_API.md`, `DATAFLOW.md`, `DEPENDENCY_GRAPH.md`, `PACKAGE_STRUCTURE.md`, `PERFORMANCE_SPEC.md`, `SECURITY_SPEC.md`, `STORAGE_STRATEGY.md` — eleven documents describing a platform that does not compile and that nothing imports. Meanwhile the actual application logs through 192 `console.*` calls and two duplicate ad-hoc loggers.

`src/diagnostics/core/diagnostics-manager.ts` imports seven modules that were never created (`../interfaces/runtime-adapter`, `../health/health-checker`, `../performance/performance-monitor`, `../performance/startup-profiler`, `../reporting/diagnostics-exporter`, `../metrics/metrics-collector`, `../metrics/event-metrics`). The directories `health/`, `performance/`, `reporting/`, `metrics/` and `interfaces/` do not exist under `src/diagnostics/`.

**Risk:** ~3,750 lines carrying full documentation weight and zero delivered value. Each one raises the apparent completeness of the platform while contributing nothing, and each will confuse the next person who tries to add telemetry (they will reasonably assume the observability layer works).

**Note:** `src/observability/` is also the only part of `src/` with real vitest tests (`telemetry.test.ts`, `metrics/metrics.test.ts`, 78 assertions) — so parts of it *are* verified in isolation. The problem is adoption, not craftsmanship.

---

## QUA-005 — MEDIUM — God files

| File | LOC | Notes |
| :--- | ---: | :--- |
| `src/routes/brain.tsx` | **2,106** | Largest file in the repo. A single route component with fan-out 24, reaching directly into GENESIS memory, candidates, stories, understanding, insights, identity, planning, recall, importance, and `src/lib/logger`. It is the only consumer of `src/lib/logger.ts`. |
| `src/routes/chat.tsx` | **1,610** | Fan-out 19. Contains its own legacy-chat migration logic (`LegacyChatMessage`, `migrateLegacyChatHistory`) and calls `companionStateService.bootstrap()` directly (DEP-004) — a route re-initialising the cognitive layer. |
| `src/analytics/tests/analytics.test.ts` | **1,227** | Hand-rolled test script, 0 assertions under vitest, 19 arity errors (TST-002). |
| `src/persistence/akira-store.ts` | **928** | Single writer for all workspace state; 42 outbound imports; 17 event publishes; 36 fire-and-forget DB writes; 2 global provider registrations at module scope. |
| `src/genesis/identity/services/IdentityService.ts` | **827** | Initialises 14 sibling services with a shared repository. |
| `src/app/ui/sidebar.tsx` | 738 | Unused shadcn primitive (QUA-003). |
| `src/analytics/metrics/calculators.ts` | 700 | Multiple calculator classes in one file — defensible cohesion. |
| `src/genesis/understanding/rules.ts` | **673** | 9 functions across 673 lines; the core understanding-derivation logic in one module. |
| `src/routes/settings.tsx` | 661 | Includes the API-key entry UI (SEC-002). |
| `src/genesis/context/ai/provider-manager.ts` | 532 | Config persistence, key management, metrics, status, streaming state, React subscription — six responsibilities. |
| `src/genesis/planning/repositories/InMemoryTemplateRepository.ts` | 530 | Almost entirely hard-coded plan template data (GEN-009). |

**Risk:** `brain.tsx` and `chat.tsx` together are 3,716 lines of route code that bypass every service boundary the architecture defines. They are where a UI change is most likely to break cognition and vice versa.

---

## QUA-006 — MEDIUM — Dev-only mock paths in production code

| Location | Behaviour |
| :--- | :--- |
| `src/akira-os/timeline/service.ts:44-51` | `if (process.env.NODE_ENV !== "production" && !== "test") await this.seedDevelopmentEvents()` — writes fabricated timeline events into the real database. **Currently unreachable**: `timelineService.initialize()` is a no-op in the browser (`services/index.ts:3-8`) and has no server-side production caller, so this path only runs from tests. A live hazard the moment anyone wires server-side initialisation. |
| `src/akira-os/vault/server/index.ts:124` `uploadMockFileServerRpc` | The **only** upload path in the application. It is reached from `useUploadQueue.ts:22` → `routes/tools.vault.tsx` and `routes/vault.tsx`. So the vault's production upload flow runs through an endpoint named "mock". |
| `src/genesis/context/ai/providers/{gemini,openrouter}-provider.ts` | On a missing API key, returns a fabricated assistant reply containing invented metrics, with only a `console.warn`. See REL-012 — this is a trust problem, not just a naming one. |
| `src/runtime/runtime-manager.ts` | Contains `mock` references (module-context shims). Harmless in an unadopted subsystem. |

**Risk:** the boundary between "real" and "mock" is drawn by naming convention and `NODE_ENV` string comparison, in three different ways, in production source. `uploadMockFileServerRpc` being the real upload path is the clearest example of the confusion this creates.

---

## QUA-007 — MEDIUM — 371 uses of `any`, concentrated where types matter most

`grep -rn ": any\|as any\|<any>" src | wc -l` → **371**, with the rule disabled in four separate config blocks.

Worst concentrations, by impact rather than count:

| Location | Effect |
| :--- | :--- |
| `src/sdk/core/sdk-context.ts` — all 9 service types are `unknown` | The entire public module contract is untyped; 16 `as any` casts follow (DEP-006) |
| `src/instrumentation/middleware/index.ts` — `type Middleware = (event: any) => any` | The event validation pipeline is untyped end to end |
| `src/instrumentation/subscribers/timeline-subscriber.ts:6` — `constructor(private timelineRepository: any)` | The Timeline contract exists (`contracts/repositories/TimelineRepository.ts`) and is not used here |
| `src/analytics/validation/rebuild-manager.ts:21` — `private db: any` | Bypasses the `Database` type on the rebuild path |
| `src/runtime/lifecycle/lifecycle-manager.ts:217` — `(instance.context.runtime as any)?.capabilityRegistry` | Accesses a member absent from `IRuntimeManager` (DEP-008) |
| `src/instrumentation/server/index.ts:19` — `(globalEventBus as any).subscribers` | Reads a `private` field (DEP-008) |

**Risk:** `any` is used precisely at the seams — SDK, event pipeline, runtime context, repository injection — where a type would have caught the boundary defects this audit found by hand.

---

## QUA-008 — MEDIUM — Duplicate logic and parallel implementations

Beyond the byte-identical files in QUA-003:

| Duplication | Locations |
| :--- | :--- |
| `uid()` helper, three variants | `genesis/events/event-service.ts`, `genesis/candidate/candidate-service.ts`, `genesis/memory/memory-service.ts`, `genesis/stories/story-service.ts`, `akira-os/timeline/service.ts`, `persistence/akira-store.ts` (all `crypto.randomUUID` with a `Math.random` fallback) — plus `genesis/context/state/service.ts:17`, which uses **only** the weak `Math.random` fallback, and `runtime/manifest/manifest-loader.ts`'s own `generateUUID`. Seven copies, one of them weaker than the rest. |
| Vault DDL | `src/persistence/initializer.ts` (inline) **and** `src/persistence/migrations/002_file_vault.sql` (dead) — PLT-003 |
| Serialisation validation | `instrumentation/middleware/index.ts:serializationValidator` and `instrumentation/event-store/sqlite-event-repository.ts:insert` run the identical `isSerializable` checks on the same event |
| Confidence-label formatting | `genesis/understanding/serializer.ts` and `genesis/insights/insight-serializer.ts` both implement the same `>= 0.85 → "High" / >= 0.6 → "Medium" / else "Low"` ladder |
| Legacy-state migration | `persistence/migration-impl.ts` (workspace) and `routes/chat.tsx:118 migrateLegacyChatHistory` (chat), two independent localStorage migrations with different idempotency strategies |
| `validate_migration` | `src/persistence/validate_migration.ts`, `src/persistence/validateMigration.ts`, `scripts/validate_migration.ts` — three files |

---

## QUA-009 — MEDIUM — Naming inconsistencies that hide real ambiguity

| Issue | Detail |
| :--- | :--- |
| `Events.TASK_CREATED` / `TASK_COMPLETED` declared twice | Two domains share one constant name; the workspace meaning is unreachable (BND-002) |
| `GoalStatus`, `HabitStatus`, `RelationshipStatus`, `GoalCategory` | Each defined in two GENESIS subsystems and re-exported ambiguously (DEP-011). `GoalStatus` meaning different things in the identity model and the goals engine is a genuine domain collision. |
| `createDefaultStrategyRegistry` | A **value** exported from two modules through the same barrel (DEP-011) |
| `VaultStorageService` | Server-only service and client RPC proxy, same name, different semantics (DEP-013) |
| `HealthEvaluation.ruleId` vs producers' `ruleName` | Contract and implementations disagree (DEP-002) |
| `validate:architecture` | The npm script validates SQLite migration behaviour, not architecture; it also cannot run (5 unresolved imports) |
| File-naming conventions | `PascalCase.ts` (`IdentityService.ts`, `VaultStorageService.ts`), `kebab-case.ts` (`event-service.ts`, `memory-service.ts`) and `lowercase.ts` (`engine.ts`, `rules.ts`, `builder.ts`) coexist within `src/genesis/`. Not worth changing, but it makes greps unreliable. |
| `src/components/` vs `src/app/ui/` | Two component roots; vault components live in the former, everything else in the latter. `DIRECTORY_STRUCTURE.md` documents neither. |

---

## QUA-010 — LOW — Committed artefacts

```
src/persistence/temp_e2e_akira.db          4 KB
src/persistence/temp_e2e_akira.db-shm     32 KB
src/persistence/temp_e2e_akira.db-wal    103 KB
```
Tracked in git. `.gitignore` covers `tmp/`, `temp/`, `coverage/`, `.output`, `dist` — but has no `*.db` pattern. `src/persistence/scratch/VaultTest/Temp/` exists on disk because `src/akira-os/vault/vault.test.ts:6-9` points `AKIRA_VAULT_PATH` into the source tree.

Also present: `.lovable/`, `.tanstack/`, `.wrangler/`, `.output/` build-tool directories (the last three are gitignored; `.lovable/` is not).

---

## QUA-011 — LOW — Weak abstractions worth naming

| Abstraction | Weakness |
| :--- | :--- |
| `contracts/workspace-provider.ts` | Excellent **contract**, but it is also the module that holds mutable global state and a `register`/`get` pair — mixing an interface declaration with a service locator in the layer documented as "pure typescript files" (BND-006) |
| `shared/genesis-provider.ts` | Silent-null fallbacks: `saveMemory` no-ops, `getMemories` returns `[]`. Contrast with `getWorkspaceProvider()`, which throws. Two failure philosophies in adjacent files (DEP-003) |
| `EventSubscriber` interface | `onEvent(): void \| Promise<void>` — the union means the bus cannot know whether a subscriber completed, which is the root of PLT-007's swallowing |
| `Middleware` type | `(event: any) => any` — no way to express "this middleware validates" vs "this one enriches" |
| `IModuleInstance` | Omits `definition`, which the lifecycle manager requires at 10 sites (DEP-009) |
| `ModuleContext` | No permission object, so permissions cannot be enforced even voluntarily (SEC-005) |
| String-keyed context filtering | `p.startsWith("Active Focus:")` as a privacy control (GEN-007) |

---

## What is high-quality and should be left alone

| Area | Why |
| :--- | :--- |
| Rule-engine pattern across GENESIS | 14 subsystems (`candidate`, `validation`, `importance`, `recall`, `story`, `understanding`, `identity`, `health`, `reflection`, `reasoning`, `decision`, `relevance`, `context-resolution`, `planning-recommendation`) all follow `types.ts` / `rules.ts` / `builder.ts` / `service.ts` / `events.ts` with pluggable strategy registries and provenance on every output. Uniform, testable, and genuinely well factored. |
| `akira-os/*/{services,server}` split | Applied identically across all 8 feature modules; keeps `better-sqlite3` off the client without a build plugin. |
| `contracts/repositories/*` | 11 clean interfaces with `Sqlite*` implementations behind them. |
| `runtime/manifest`, `runtime/resolver`, `runtime/registry` | Typed error hierarchies, zod strict schemas, deterministic ordering, semver handling, pluggable selectors. The best code in the repository (see `04`). |
| `persistence/schema.sql` | Real `CHECK` constraints, FK cascade rules, 22 well-chosen indexes, FTS5 with trigger maintenance. |
| `persistence/migration-impl.ts` | Idempotency table, staged status, input validation, transactional import, typed result. |
| `server.ts` h3 error normalisation | Encodes hard-won framework knowledge correctly. |
| `SqliteTimelineRepository.findPaged` | Correct composite-cursor keyset pagination. |
| Newer GENESIS test suites | `genesis-reasoning-*`, `genesis-reflection-*`, `genesis-decision-engine`, `genesis-relevance-engine` — crash isolation, ordering, instance identity, exact output shape. This is the standard the rest should be raised to. |
| Prettier configuration | Consistent formatting across 373 files with zero drift beyond 25 nits. |
| `CODEOWNERS` | Real ownership boundaries mapped to the actual directory structure, with joint approval required on `contracts/`, `shared/` and `lib/`. |

---

## Technical-debt ledger

| Debt | Size | Interest rate | Principal risk |
| :--- | :--- | :--- | :--- |
| No CI / no typecheck script / lint gate disabled | small to fix | **very high** | Every other item compounds silently (TST-001, QUA-001) |
| 18 hand-rolled test files, 4,230 LOC, 0 assertions | large | **very high** | All AKIRA OS platform defects are invisible (TST-002) |
| Observability + diagnostics + compatibility unwired | ~3,750 LOC | high | Documented capability that does not exist (QUA-004) |
| Zero debt markers | n/a | high | Scaffolding indistinguishable from product (QUA-002) |
| GENESIS barrel forcing 208 files into the client | medium | high | Build fragility, bundle size, import-time side effects (BND-003/004) |
| 26 genuinely dead files + 4 byte-identical duplicates | small | medium | Divergent fixes (QUA-003, DEP-007) |
| 371 `any` at the system seams | medium | medium | Boundary defects go undetected (QUA-007) |
| `brain.tsx` + `chat.tsx` = 3,716 LOC of boundary-bypassing route code | large | medium | UI/cognition coupling (QUA-005) |
| Two event buses | medium | high | Root cause of BND-001 |
| Schema versioning with no ladder | medium | medium | No forward migration path (PLT-003) |
| Seven `uid()` implementations, one weaker | small | low | Latent id-collision risk in companion state |
| Committed `.db` artefacts and scratch scripts | trivial | low | Confusion only (QUA-010) |
