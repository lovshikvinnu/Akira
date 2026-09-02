# 02 — Architectural Boundary Audit

**Method:** a static import graph was built over all 617 TS/TSX files in `src/`, `tests/` and `scripts/` (2,020 resolved edges), then every cross-directory edge was classified against the intended layering. All findings below cite files and symbols.

---

## Summary verdict on the intended boundary

Intended:

```
AKIRA OS  ──events──►  GENESIS  ──context──►  AI Provider
```

Measured: **the events arrow does not exist in the running code.** GENESIS subscribes to one event bus; AKIRA OS publishes workspace reality to a *different* event bus; the only bridge between them runs in the wrong direction and explicitly filters out the one event type GENESIS actually receives.

This is finding **BND-001** and it is the root cause of most GENESIS-side findings in `05-genesis-cognitive-system.md`.

---

## BND-001 — CRITICAL — The AKIRA OS → GENESIS event path is severed

**Finding:** AKIRA OS publishes all workspace reality events to the *instrumentation* event bus. GENESIS listens only on the *legacy* `shared/infrastructure/event-bus`. No bridge carries instrumentation events to the legacy bus. Consequently GENESIS can only ever observe `presence.updated`.

**Locations & evidence:**

1. `src/genesis/events/event-service.ts:94` — GENESIS's sole reality intake:
   ```ts
   eventBus.subscribe("*", (evt) => { … })   // eventBus = shared/infrastructure/event-bus
   ```
   Its `switch` handles `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_CONTINUED`, `TASK_COMPLETED`, `MISSION_COMPLETED`, `NOTE_CREATED`, `NOTE_EDITED`, `PRESENCE_UPDATED`.

2. `src/persistence/akira-store.ts` — the single writer of all workspace state (projects, tasks, notes, sessions, chat, streaks, vault) publishes at **17 call sites**, all of them to the instrumentation publisher:
   ```ts
   import { publish } from "../instrumentation";
   …
   publish({ type: "task.created",  source: "tasks-store", … });   // line 249
   publish({ type: "task.completed", source: "tasks-store", … });  // line 270
   ```
   `grep -c "Events\." src/persistence/akira-store.ts` → **0**. The `Events` registry is imported (line 5) and never used.

3. Exhaustive census of `eventBus.publish(` (legacy bus) across `src/`:
   - `src/akira-os/presence/service.ts:26,39,101` → `Events.PRESENCE_UPDATED`
   - `src/runtime/lifecycle/lifecycle-manager.ts` (8 sites) and `src/runtime/registry/capability-registry.ts` (3 sites) → module lifecycle / capability events, which never fire because no modules are ever loaded (see BND-007)
   - `src/runtime/runtime-manager.ts:449` → forwards module-context publishes
   - test files
   **No workspace domain event is ever published on the legacy bus.**

4. The only bridge is legacy → instrumentation, and it is one-way with an explicit exclusion — `src/shared/infrastructure/event-bus/index.ts:64-80`:
   ```ts
   import("../../../instrumentation").then(({ publish }) => {
     if (eventType !== "presence.updated") { publish({ … }); }
   }).catch(() => {});
   ```

**Risk:** the entire v2.17 REMEMBER and v2.18 UNDERSTAND pipeline (candidates → validation → memories → stories → understanding → insights → recall → importance) is fed exclusively by `presence.updated` pings plus GENESIS's own synthetic bootstrap event (see GEN-003). Completing a task, creating a project, writing a note or finishing a mission produces **no cognitive effect whatsoever**.

**Root cause:** an event-system migration ("Sprint 2.1 fallback bridge", per the comment in the legacy bus) moved producers to the new bus without moving the single consumer, and the bridge was built in the producer→store direction only.

---

## BND-002 — CRITICAL — Duplicate keys in the central event registry silently remap two event names

**Finding:** `src/contracts/events.ts` declares `TASK_CREATED` and `TASK_COMPLETED` twice each. In JavaScript the later declaration wins silently.

**Location:** `src/contracts/events.ts`
```
line  6:  TASK_CREATED:    "task.created"
line  7:  TASK_COMPLETED:  "task.completed"
line 76:  TASK_CREATED:    "planning.task.created"     ← wins
line 77:  TASK_COMPLETED:  "planning.task.completed"   ← wins
```

**Evidence:** `tsc` reports `src/contracts/events.ts(76,3): error TS1117` and `(77,3): error TS1117` — "An object literal cannot have multiple properties with the same name."

**Consumers affected:**
- `src/genesis/events/event-service.ts:121` — `case Events.TASK_COMPLETED:` now compares against `"planning.task.completed"`. Even if BND-001 were fixed, workspace task completion would still not map to a `task_completed` memory event.
- `src/akira-os/timeline/service.ts:83,122` — dev-seed events are emitted with `planning.*` names, which are **not** in `TimelineSubscriber.isEventSupported()`'s allowlist (`src/instrumentation/subscribers/timeline-subscriber.ts:59-82`), so they would be dropped.
- `src/genesis/planning/services/TaskService.ts:44,93` — planning correctly wants the `planning.*` names, and gets them.

**Risk:** two distinct domains (workspace tasks and planning tasks) share one constant name; the workspace meaning is unreachable through the registry. Any future consumer that writes `Events.TASK_COMPLETED` intending workspace semantics is silently wrong.

---

## BND-003 — HIGH — GENESIS is compiled into the browser bundle together with the whole platform

**Finding:** `src/routes/__root.tsx` imports 8 GENESIS services from `@/genesis`, which resolves to `src/genesis/index.ts` — a barrel with 61 outbound imports that transitively re-exports every GENESIS subsystem including `planning`, `identity`, `understanding`, and the AI providers.

**Evidence:** the build failure trace names the exact chain:
```
src/genesis/planning/services/AdaptivePlanningService.ts
 ← src/genesis/planning/index.ts
 ← src/genesis/index.ts
 ← src/routes/__root.tsx
 ← src/routeTree.gen.ts
 ← src/app/router/router.tsx
 ← src/router.tsx
 ← @tanstack/start-client-core/hydrateStart
```
The last four entries are the **client** hydration entry.

**Risk:**
- A single missing file anywhere in the cognitive layer takes down the whole client bundle (this is exactly what is happening today — see REL-001).
- 21,657 lines of cognitive code, including 9 module-load side effects (BND-004), are shipped to and executed in the browser with no code-splitting boundary.
- `MODULE_CONTRACT.md`/`DIRECTORY_STRUCTURE.md` describe GENESIS as a separate cognitive loop; there is no import boundary enforcing it.

**Contributing factor:** `vite.config.ts` sets `tanstackStart: { importProtection: { enabled: false } }`, disabling the build-time import boundary that `DIRECTORY_STRUCTURE.md` §3 explicitly promises ("Imports to database prepared statements from any file loaded by the browser … will throw an import-boundary error at build-time"). Server-only leakage is currently prevented only by hand-written `if (typeof window !== "undefined") throw` guards at the top of `persistence/connection.ts`, `persistence/initializer.ts`, `akira-os/vault/VaultValidationService.ts` and `akira-os/vault/VaultStorageService.ts`.

---

## BND-004 — HIGH — Nine GENESIS modules self-initialise at import time, bypassing all lifecycle control

**Finding:** these modules invoke initialisation at module scope, so importing the barrel starts subscriptions and timers:

| File | Line | Statement |
| :--- | ---: | :--- |
| `src/genesis/events/event-service.ts` | 166 | `eventService.initialize();` (subscribes `"*"` on the legacy bus) |
| `src/genesis/candidate/candidate-service.ts` | 103 | `candidateService.initialize();` |
| `src/genesis/context/context-builder.ts` | 96 | `contextBuilder.initialize();` |
| `src/genesis/importance/importance-builder.ts` | 76 | `importanceBuilder.initialize();` |
| `src/genesis/insights/insight-engine.ts` | 173 | `insightEngine.initialize();` |
| `src/genesis/memory/relationships/relationship-service.ts` | 137 | `relationshipEngine.initialize();` |
| `src/genesis/stories/story-builder.ts` | 94 | `storyBuilder.initialize();` |
| `src/genesis/understanding/engine.ts` | 165 | `understandingEngine.initialize();` |
| `src/genesis/understanding/identity-builder.ts` | 91 | `identityBuilder.initialize();` |

Two more register global providers at import time: `src/genesis/context/state/service.ts:282` (`registerCompanionStateProvider`) and `src/persistence/akira-store.ts:917,928` (`registerStoreProvider`, `registerWorkspaceProvider`).

**Risk:** initialisation order is determined by module-resolution order, not by a lifecycle contract. None of these can be started, stopped, restarted, or tested in isolation. `src/runtime/lifecycle/lifecycle-manager.ts` (376 lines, a full state machine with hooks, timeouts and policies) governs **zero** of them.

---

## BND-005 — HIGH — `persistence` ↔ `akira-os` bidirectional coupling, including a 19-file dependency cycle

**Finding:** the persistence layer imports the feature modules it is supposed to sit beneath.

**Evidence — edge counts:** `akira-os → persistence` = 55; `persistence → akira-os` = 38.

**Evidence — the cycle.** Tarjan SCC analysis finds a strongly-connected component of 19 files:
```
persistence/connection.ts
persistence/repositories/index.ts
persistence/repositories/Sqlite{Project,Note,Task,Session,Settings,Timeline,Search,SearchHistory,VaultFile,VaultFolder,VaultTag}Repository.ts
akira-os/search/{index,services/index,server/index}.ts
instrumentation/{index,publisher,server/index}.ts
```

**Mechanism:** `src/persistence/connection.ts:50-79` monkey-patches `db.prepare` so that every write statement lazily `import("../akira-os/search")` to call `searchService.clearCache()`:
```ts
const originalPrepare = (db as any).prepare;
(db as any).prepare = function (sql: string) {
  const stmt = originalPrepare.call(this, sql);
  const isWrite = /insert\s+into|update|delete\s+from/i.test(sql);
  const isSearchTable = /projects|tasks|notes|sessions|timeline_events/i.test(sql);
  if (isWrite && isSearchTable) { /* wrap stmt.run to clear the search cache */ }
  return stmt;
};
```
Separately, `src/persistence/akira-store.ts` imports `akira-os/{projects,tasks,notes,sessions,settings,vault}/index.ts` (36 of the 38 reverse edges) to call their client RPC facades.

**Risk:** the infrastructure layer cannot be reasoned about, tested, or replaced independently of the feature modules. The monkey-patch is also functionally unsound — see PERF-004 / DAT-006.

---

## BND-006 — MEDIUM — `contracts/` and `shared/` depend upward on the layers they are supposed to serve

`DIRECTORY_STRUCTURE.md` §2.3 states `src/contracts/` "May only import types from `shared/types/`" and contains "no execution code".

**Violations:**

| Violation | Location |
| :--- | :--- |
| `contracts` imports a feature module's types | `src/contracts/repositories/TimelineRepository.ts` → `src/akira-os/timeline/types.ts` |
| `contracts` contains executable mutable state | `src/contracts/workspace-provider.ts:12` — `let activeWorkspaceProvider: WorkspaceProvider \| null = null;` plus `registerWorkspaceProvider`/`getWorkspaceProvider` |
| `shared` imports the cognitive layer | `src/shared/genesis-provider.ts:3` → `@/genesis/context/state/types` |
| `shared` imports platform instrumentation | `src/shared/infrastructure/event-bus/index.ts:74` → `src/instrumentation` |

**Risk:** `contracts` and `shared` are the two layers everything else depends on (fan-in 36 and 44 respectively). Upward edges from them make the dependency graph acyclic only by accident and prevent extracting either as a standalone package.

---

## BND-007 — MEDIUM — The Platform Runtime is wired to nothing

**Finding:** `src/runtime/` (37 files, 2,856 LOC — manifest system, dependency resolver, lifecycle manager, capability registry, permission framework) has **zero inbound imports from production code**. Its only consumers are `tests/runtime.test.ts`, `tests/lifecycle.test.ts`, `tests/manifest.test.ts`, `tests/dependency-resolver.test.ts`, `tests/capability-registry.test.ts`.

**Evidence:** the measured cross-layer table in `01-repository-map.md` §6 contains `7 tests → runtime` and `5 runtime → shared`, with no `routes → runtime`, `app → runtime`, `akira-os → runtime` or `genesis → runtime` edges.

**Risk:** the runtime is unvalidated against any real module. Every AKIRA OS subsystem is instead a hard-coded import (BND-004), so none of them are isolated, permissioned, versioned, or independently loadable. This is the gap that matters most for third-party modules, TITAN and FORGE readiness.

**Classification:** this is *not* an "unfinished future feature" exclusion — the runtime is implemented, documented across ADR-016…ADR-020, tested in isolation, and simply never adopted.

---

## BND-008 — MEDIUM — GENESIS couples to AKIRA OS internals rather than to a stable contract

**Finding:** 14 GENESIS files import from `src/akira-os/` directly.

| Target | Importers |
| :--- | :--- |
| `src/akira-os/presence/types.ts` | 12 files: `context/context-resolution/{types,rules,builder,service}.ts`, `context/{goals,habits,knowledge,relationships}/types.ts`, `context/state/{types,rules,builder,service}.ts` |
| `src/akira-os/index.ts` | `src/genesis/context/ai/provider-manager.ts` (2 sites, dynamic `await import("@/akira-os")` for `settingsService`) |

**Risk:** `PresenceContext` is a platform-internal shape with 15 fields (including `evidence`, `continuityConfidence`, `presenceConfidence`); it is now baked into 12 cognitive modules. AKIRA OS cannot evolve the Presence Engine without breaking GENESIS. The `contracts/` layer exists precisely for this and is not used here.

**Note on direction:** GENESIS → AKIRA OS is the *correct* direction (downward). The problem is the *target*: internal module types instead of a published contract. Contrast with `contracts/workspace-provider.ts`, which GENESIS uses correctly in 12 files for state access.

---

## BND-009 — MEDIUM — GENESIS reaches the platform settings store to persist its own configuration

**Finding:** `src/genesis/context/ai/provider-manager.ts` (lines 120-235) dynamically imports `@/akira-os` and uses `settingsService.get/set` to read and write four keys: `akira:ai:active_provider`, `akira:ai:keys`, `akira:ai:statuses`, `akira:ai:models`.

**Risk:** GENESIS owns durable rows in an AKIRA OS-owned table without a contract, schema, or migration story. This is the only place GENESIS writes durable state anywhere, and it does so through a generic key/value escape hatch — which is also how the API keys end up in plaintext (see `09-security-audit.md`, SEC-002).

---

## BND-010 — LOW — Four file-level dependency cycles outside the persistence SCC

| Cycle | Files |
| :--- | :--- |
| Runtime core (5) | `runtime/module-context.ts` ↔ `runtime/module-instance.ts` ↔ `runtime/lifecycle/lifecycle-manager.ts` ↔ `lifecycle-hooks.ts` ↔ `lifecycle-policy.ts` |
| Observability logging (2) | `observability/logging/logger.ts` ↔ `observability/logging/logger-registry.ts` |
| Vault UI (7) | `hooks/usePreview.ts` → `components/vault/{PreviewPanel,FileList,Thumbnail,FileGrid,VaultWorkspace}.tsx` → `routes/tools.vault.tsx` → back to `usePreview` |
| Router (3) | `router.tsx` ↔ `routeTree.gen.ts` ↔ `app/router/router.tsx` — generated, expected for TanStack Router |

Direct mutual imports (A↔B): 3 pairs — `logger`↔`logger-registry`, `lifecycle-manager`↔`module-instance`, `module-context`↔`module-instance`.

The router cycle is inherent to the framework and is **not** a defect. The runtime and logging cycles are small and type-dominated; the vault UI cycle crosses `hooks/ → components/ → routes/`, which `DIRECTORY_STRUCTURE.md` §2.6 forbids ("routes … No raw business logic"; `hooks` importing `routes` inverts the UI layering).

---

## Boundary compliance scorecard

| Intended rule | Status | Evidence |
| :--- | :--- | :--- |
| AKIRA OS must contain no cognitive reasoning | **HOLDS** | No `akira-os → genesis` import edge exists. `presence/rules.ts` is deterministic classification, not cognition. |
| GENESIS must not own UI | **HOLDS** | No `genesis → app`/`components`/`routes` edges. |
| GENESIS must not own platform runtime / module loading | **HOLDS** | No `genesis → runtime` edges. |
| GENESIS must not own generic storage engines | **HOLDS** | Zero `genesis → persistence` / `better-sqlite3` imports; access is via `contracts/workspace-provider.ts`. |
| GENESIS must not own platform permissions | **HOLDS** | No `genesis → runtime/permissions` edges. |
| GENESIS receives reality via events | **BROKEN** | BND-001 |
| GENESIS does not couple to AKIRA OS internals | **BROKEN** | BND-008 |
| `contracts/` is pure types importing only `shared/types` | **BROKEN** | BND-006 |
| `persistence/` sits below feature modules | **BROKEN** | BND-005 |
| Browser must never load DB code (build-enforced) | **UNENFORCED** | `importProtection: { enabled: false }`; runtime `throw` guards only |
| Module boundaries are enforceable | **NOT ENFORCED** | BND-007; no CI, no dependency-cruiser/eslint boundary rules |

**The good news is real:** the five hardest boundaries to retrofit — no cognition in the platform, no UI/runtime/storage/permissions in GENESIS — all hold cleanly. The `WorkspaceProvider` read-only contract is a genuinely well-designed seam and is respected in all 12 places GENESIS reads workspace state. The damage is concentrated in the *event* seam and in the two shared foundation directories.
