# 01 — Repository Map

**Audit date:** 2026-09-02
**Commit at audit time:** `f2d8cf6` (`feat(genesis): implement Reflection Engine subsystem`), branch `main`
**Working tree:** dirty — 1 modified file (`src/genesis/index.ts`), 8 untracked paths (`src/genesis/decision/`, `src/genesis/reasoning/`, 4 test files, 2 docs)
**Mode:** read-only observation. No recommendations in this document.

---

## 1. Scale

| Metric | Value |
| :--- | :--- |
| Total files under `src/` | 601 |
| TypeScript/TSX files under `src/` | 373 |
| Lines of TS/TSX under `src/` | 64,224 |
| Test files (`*.test.ts(x)`) repo-wide | 42 |
| Lines of test code | 12,662 |
| Import edges resolved (src + tests + scripts) | 2,020 |
| Unresolved import specifiers | 25 |
| Git commits | 16 |
| Git tags | 10 |
| CI workflow files | 0 |

### Lines of code by top-level directory

| Directory | Files | LOC | Stated pillar |
| :--- | ---: | ---: | :--- |
| `src/genesis/` | 208 | 21,657 | GENESIS |
| `src/routes/` | 18 | 8,809 | AKIRA OS (UI) |
| `src/app/` | 78 | 7,606 | AKIRA OS (UI) |
| `src/analytics/` | 31 | 4,661 | AKIRA OS |
| `src/persistence/` | 24 | 3,990 | AKIRA OS |
| `src/akira-os/` | 44 | 3,470 | AKIRA OS |
| `src/observability/` | 34 | 3,242 | AKIRA OS |
| `src/runtime/` | 37 | 2,856 | AKIRA OS |
| `src/components/` | 21 | 2,645 | AKIRA OS (UI) |
| `src/instrumentation/` | 24 | 2,146 | AKIRA OS |
| `src/hooks/` | 7 | 712 | AKIRA OS (UI) |
| `src/shared/` | 9 | 482 | Shared |
| `src/sdk/` | 14 | 366 | AKIRA OS |
| `src/compatibility/` | 15 | 332 | AKIRA OS |
| `src/contracts/` | 14 | 328 | Shared |
| `src/diagnostics/` | 4 | 182 | AKIRA OS |
| `src/lib/` | 5 | 181 | Shared |
| `src/workers/` | 1 | 48 | AKIRA OS |
| `src/testing/` | 1 | 1 | Tooling |

Neither TITAN nor FORGE exists in any form. Per the audit brief this is intentional and is **not** recorded as a defect.

---

## 2. Folder tree (2 levels, `src/`)

```
src/
├── akira-os/            Platform feature modules (client service facades + server RPC)
│   ├── notes/ projects/ sessions/ settings/ tasks/ vault/ search/ timeline/
│   │     each: index.ts, services/ (client RPC proxies), server/ (createServerFn)
│   ├── presence/        Presence Engine (rules/builder/service/events) — no server/ dir
│   └── tools/           Sidebar tool registry
├── analytics/           Analytics Engine, metrics calculators, query layer, rebuild/validation
│   ├── engine/ metrics/ repository/ service/ dashboard/ validation/ shared/ models/ tests/
├── app/                 UI framework: shell, router wiring, design-system primitives
│   ├── router/ shell/ ui/ (incl. ui/timeline/, ui/search/, ui/dialogs/)
├── compatibility/       Compatibility Layer (adapters + manager)  [BROKEN — see §6]
├── components/          Vault feature components (outside app/)
├── contracts/           Interfaces: events registry, repository contracts, workspace-provider
├── diagnostics/         Runtime Diagnostics                        [BROKEN — see §6]
├── genesis/             Cognitive layer (see §4)
├── hooks/               React hooks (preview, upload queue, …)
├── instrumentation/     Event Bus v2, Event Store (SQLite), middleware, subscribers
├── lib/                 utils, logger, error capture/page/reporting
├── observability/       Telemetry/metrics/tracing/logging platform  [UNWIRED — see §6]
├── persistence/         SQLite connection, initializer, schema, repositories, akira-store
├── routes/              TanStack file-based routes
├── runtime/             Platform Runtime: manifest, resolver, lifecycle, registry, permissions
├── sdk/                 Platform SDK                                [BROKEN — see §6]
├── shared/              types, event-bus v1 (legacy), logger, error, genesis-provider
├── testing/             setup.ts (contents: "// removed during modernization")
└── workers/             thumbnail-worker.ts
```

---

## 3. Entry points

| Entry | File | Role |
| :--- | :--- | :--- |
| Server entry | `src/server.ts` | Wraps TanStack Start server-entry; calls `initializeDatabase()` at module load; normalises h3-swallowed 500s |
| Client entry | `src/router.tsx` → `src/app/router/router.tsx` | Creates the router from `routeTree.gen.ts` |
| Route tree (generated) | `src/routeTree.gen.ts` | 18 routes |
| Root route | `src/routes/__root.tsx` | Boot sequence: legacy-state migration → SQLite hydration → GENESIS/presence service init |
| Start shim | `src/start.ts` | Lovable error-reporting bootstrap |
| Build config | `vite.config.ts` (via `@lovable.dev/vite-tanstack-config`) | `importProtection: { enabled: false }` |
| Test config | `vitest.config.ts` | `setupFiles: ./src/testing/setup.ts`; no path-alias plugin |
| Scripts | `scripts/validate-architecture.ts`, `scripts/migrate-runall.ts`, `scripts/validate_migration.ts` | Standalone `tsx` scripts |

A second, unreferenced `setup.ts` exists at the repository root (mocks `process.exit`); `vitest.config.ts` points at `src/testing/setup.ts` instead, whose entire content is the comment `// removed during modernization`.

---

## 4. GENESIS subsystem inventory

| Directory | Files | Purpose as implemented |
| :--- | ---: | :--- |
| `events/` | 1 | `eventService` — bridges the **legacy** event bus into `MemoryEvent`s; persists via `saveMemory` |
| `candidate/` | 3 | Rule-based memory-candidate generation from `MemoryEvent`s |
| `validation/` | 3 | Promote / Hold / Reject rules for candidates |
| `memory/` | 5 | `memoryService` (in-process `Memory[]`), memory relationships |
| `importance/` | 5 | Importance signal scoring |
| `recall/` | 4 | Recall candidate index + rules |
| `stories/` | 4 | Narrative arc construction |
| `understanding/` | 15 | Understanding graph, hypotheses, intent classifier/resolver, identity (legacy) |
| `insights/` | 20 | Insight engine + Reflection Engine (strategy registry) |
| `identity/` | 17 | Identity Foundation: 15 services + repository + 422-line type model |
| `context/` | 70 | AI providers, prompt/context builders, and 8 "intelligence" engines (goals, habits, knowledge, relationships, initiative, state, context-resolution, relevance, assembly, intelligence) |
| `planning/` | 36 | Plans, milestones, tasks, dependencies, blockers, recommendations, health rules |
| `reasoning/` | 7 | Reasoning strategies + engine (untracked, new) |
| `decision/` | 4 | Decision registry + engine (untracked, new) |

Every GENESIS repository implementation is `InMemory*`. There are no GENESIS-owned SQLite repositories.

---

## 5. Public vs internal API surfaces

### Declared public surfaces (barrels)

| Barrel | Exports | Consumers |
| :--- | ---: | :--- |
| `src/genesis/index.ts` | 61 outbound imports, 45 inbound references | `src/routes/*`, `tests/*` |
| `src/akira-os/index.ts` | 13 outbound, 24 inbound | `src/routes/*`, `src/app/*`, `src/genesis/context/ai/provider-manager.ts` |
| `src/sdk/index.ts` | `AkiraSDK`, `SDK_VERSION` | none |
| `src/instrumentation/index.ts` | full re-export of events/bus/publisher/middleware/event-store | `persistence`, `akira-os/vault`, `shared/infrastructure/event-bus` |
| `src/runtime/index.ts` | runtime manager + submodules | `tests/*` only |
| `src/observability/index.ts` | telemetry API | none |
| `src/compatibility/index.ts` | compatibility manager | none |

### Most-imported internal modules (top 10 by fan-in)

| Fan-in | Module |
| ---: | :--- |
| 45 | `src/genesis/index.ts` |
| 44 | `src/shared/types/store-types.ts` |
| 44 | `src/persistence/repositories/index.ts` |
| 43 | `src/lib/utils.ts` |
| 40 | `src/genesis/planning/types.ts` |
| 36 | `src/contracts/events.ts` |
| 35 | `src/persistence/connection.ts` |
| 35 | `src/genesis/events/event-service.ts` |
| 24 | `src/akira-os/index.ts` |
| 18 | `src/genesis/identity/repositories/IdentityRepository.ts` |

### Highest fan-out (god modules)

| Fan-out | Module | LOC |
| ---: | :--- | ---: |
| 61 | `src/genesis/index.ts` | 135 |
| 42 | `src/persistence/akira-store.ts` | 928 |
| 28 | `src/genesis/planning/index.ts` | 44 |
| 28 | `src/genesis/planning/services/PlanningService.ts` | 436 |
| 24 | `src/routes/brain.tsx` | 2,106 |

---

## 6. Observed dependency direction (measured, not documented)

Cross-directory import edge counts, top 20:

```
  55  akira-os   -> persistence
  46  routes     -> app
  45  routes     -> genesis
  43  app        -> lib
  38  persistence-> akira-os        ◄ reverse of the row above
  36  tests      -> genesis
  35  genesis    -> contracts
  20  routes     -> akira-os
  18  analytics  -> instrumentation
  14  genesis    -> akira-os        ◄ cognitive layer depends on platform modules
  14  persistence-> contracts
  13  akira-os   -> shared
  13  genesis    -> shared
  13  instrumentation -> persistence
  12  akira-os   -> contracts
  12  components -> shared
  11  app        -> akira-os
  11  persistence-> shared
  10  components -> hooks
   8  analytics  -> persistence
```

Notable single edges:

```
   1  shared        -> genesis          (src/shared/genesis-provider.ts)
   1  shared        -> instrumentation  (src/shared/infrastructure/event-bus/index.ts)
   1  contracts     -> akira-os         (src/contracts/repositories/TimelineRepository.ts)
   1  compatibility -> sdk
   0  akira-os      -> genesis          (there is no direct platform → cognitive import)
```

Direction is analysed against intent in `02-architecture-boundaries.md`.

---

## 7. Suspected legacy / abandoned areas (observation only)

| Area | Evidence |
| :--- | :--- |
| `src/shared/error/` (3 files) + `src/shared/utilities/utils.ts` | Byte-identical duplicates of `src/lib/*`; zero inbound imports |
| `src/shared/infrastructure/logger/index.ts` | Byte-identical duplicate of `src/lib/logger.ts` |
| `src/shared/infrastructure/event-bus/` | Self-described "legacy": derives sources named `*-legacy-bus`, comment "Sprint 2.1 fallback bridge" |
| `src/observability/` (34 files) | Zero inbound imports from any non-observability file; 12 type errors incl. 4 unresolved modules |
| `src/diagnostics/` (4 files) | 8 type errors, 7 unresolved modules; `diagnostics-manager.ts` has zero inbound imports |
| `src/compatibility/` (15 files) | 1 unresolved module; `index.ts` and `compatibility-factory.ts` have zero inbound imports |
| `src/sdk/` (14 files) | `akira-sdk.ts` imports a non-existent path; zero production consumers |
| `src/persistence/migrations/002_file_vault.sql` | Never referenced by any TypeScript file; the same DDL is inlined in `initializer.ts` |
| `src/persistence/check_real_db.ts`, `check_temp_db.ts`, `validate_migration.ts`, `validateMigration.ts` | Dev scratch scripts committed inside the production source tree; zero inbound imports |
| `src/persistence/temp_e2e_akira.db{,-shm,-wal}` | Binary SQLite test artifacts tracked in git |
| `src/persistence/scratch/VaultTest/Temp/` | Test scratch directory inside the source tree |
| `src/testing/setup.ts` | Content: `// removed during modernization` |
| 36 files under `src/app/ui/` | shadcn/ui primitives with zero inbound imports |

Full zero-inbound list (66 files) is reproduced in `11-code-quality.md`.

---

## 8. Toolchain state as measured

| Command | Result |
| :--- | :--- |
| `npx tsc --noEmit` | **103 errors** across 39 files (19 unresolved modules) |
| `npx vite build` | **FAILS** — `[UNRESOLVED_IMPORT] '../health/createHealthRuleEngine'` |
| `npx vitest run` | 42 test files: **22 passed, 20 failed to load**; 270 tests passed |
| `npx eslint .` | 25 errors + 1 warning, **all** `prettier/prettier` formatting |
| `npm run validate:architecture` | Script exists but validates SQLite migration behaviour, not architecture |

`package.json` defines 8 scripts: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`, `test`, `validate:architecture`. There is no `typecheck` script and no `test:coverage` script (although `@vitest/coverage-v8` is installed).

---

## 9. External runtime dependencies actually imported from `src/`

`react` (98), `lucide-react` (64), `@tanstack/react-router` (23), `vitest` (23), `node:fs` (17), `node:path` (17), `sonner` (16), `@tanstack/react-start` (13), `class-variance-authority` (9), `better-sqlite3` (8), `zod` (6), `@tanstack/react-query` (3), 30 `@radix-ui/*` packages (1–4 each), `recharts` (1), `@tanstack/react-virtual` (1), `crypto`/`os`/`timers` (1 each).

`zod` is installed and imported in 6 files. `recharts` is installed and imported once.
