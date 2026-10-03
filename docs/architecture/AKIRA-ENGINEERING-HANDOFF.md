# AKIRA — Engineering Handoff & Architecture Baseline

**Document Type:** Read-Only Engineering Handoff & Onboarding Dossier  
**Baseline Commit:** `genesis/foundation-stabilization` @ `e58020f`  
**Working Tree State:** Clean runtime/source tree (`git diff` on `src/`, `tests/`, `scripts/` is completely empty). All verification suites green: 130 test files / 1,366 vitest tests passing, 363 architectural assertions passing, `tsc --noEmit` clean, and production observability build verified.  
**Author:** Incoming Antigravity AI Engineering Agent  
**Date:** 2026-10-03  

---

## 1. Executive Summary

AKIRA is undergoing a deliberate architectural evolution from a desktop-first personal companion prototype toward a capability-oriented autonomous architecture:

$$\text{External AI Agents} \longrightarrow \text{MCP} \longrightarrow \text{AKIRA} \longrightarrow \text{VAJRA} \longrightarrow \{\text{GENESIS (Cognition)}, \text{AKIRA OS (Domain/Platform)}, \text{HANDS (Execution)}\}$$

This onboarding document captures the exact reality of the AKIRA codebase as it exists today, reconciling two complementary sources of truth:
1. **The Current Working Codebase:** The implemented TypeScript/React/SQLite repository following an extensive series of recovery, hardening, and verification passes (Phase A build recovery, Phase B event reconciliation, SQLite migration, and deep-scan audits Chats 3–6).
2. **The Architecture History & Frozen Contracts:** The canonical governing specifications created under `docs/architecture/`:
   - [AKIRA-ARCHITECTURE-DISPOSITION.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-ARCHITECTURE-DISPOSITION.md) (Phase 0)
   - [AKIRA-TARGET-ARCHITECTURE.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-TARGET-ARCHITECTURE.md) (Phase 1 & 1.1)
   - [AKIRA-FOUNDATION-CONTRACTS.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-FOUNDATION-CONTRACTS.md) (Phase 2 & 2.1)
   - [AKIRA-N1-DECISION.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-N1-DECISION.md) (Rule N1: Bounded direct internal Commands)
   - [AKIRA-N2-DECISION.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-N2-DECISION.md) (Rule N2: Non-VAJRA Tier-2 On-Demand Activation)
   - [AKIRA-N3-DECISION.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-N3-DECISION.md) (Rule N3: GENESIS Command-Freedom)
   - [AKIRA-FOUNDATION-CONTRACTS-CONSISTENCY-AUDIT-FINAL.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-FOUNDATION-CONTRACTS-CONSISTENCY-AUDIT-FINAL.md) (Audit verdict: Pass with 0 contradictions and 0 unauthorized decisions).

### Key Takeaway for Implementation
The codebase is **not** broken; rather, it is in an exceptionally stabilized intermediate state. The original build failures, type errors, swallowed SQLite errors, lost task order, mid-session deletion crashes, and prompt hallucinations discovered in early audits have all been methodically fixed and proven with 1,366 passing tests.

However, the architecture **has not yet undergone the Phase 3+ capability migration**. Cognition still runs on the client inside the browser; workspace writes are initiated from the client `akira-store` and synchronized via 47 unauthenticated RPC server functions; orchestration logic still lingers in React route controllers (`routes/chat.tsx` and `routes/__root.tsx`); and VAJRA, HANDS, and MCP do not yet exist in code.

Our mandate is strict: **do not break existing working code, do not redesign frozen decisions, and proceed via disciplined, strangler-style capability encapsulation**.

---

## 2. Current System Understanding

### 2.1 Application & Runtime Topology
AKIRA currently operates as a hybrid full-stack desktop application built with TanStack Start, React 19, Vite, and Nitro:

```
                                  USER INTERFACE
                                        │
┌───────────────────────────────────────▼────────────────────────────────────────┐
│ BROWSER RUNTIME (Client-Authoritative Cognition & UI State)                   │
│                                                                               │
│  React Routes (src/routes/ — 17 routes)                                       │
│    • routes/__root.tsx: Boot lifecycle effect, store hydration, engine starts │
│    • routes/chat.tsx: Conversation loop, turn orchestration, model streaming  │
│                                                                               │
│  State Hub: akira-store (src/persistence/akira-store.ts)                       │
│    • Reactive external store (useSyncExternalStore)                           │
│    • Optimistic write-through via dynamic import to akira-os services         │
│    • Re-entrancy guard preventing nested event wipeouts                       │
│    • Holds: workspace entities, open chat, and durable memory stream blob     │
│                                                                               │
│  Cognition Engine: GENESIS (src/genesis/)                                     │
│    • Auto-composed at module import (genesis/index.ts -> composition.ts)      │
│    • Consumes 9 translated platform event types via reality-adapter           │
│    • Assembles Cognitive Context for conversation turns                       │
│    • Browser model dispatch via fetch (Gemini / OpenRouter)                   │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ RPC transport: 47 createServerFn calls
                                        │ (HTTP POST/GET, unauthenticated)
┌───────────────────────────────────────▼───────────────────────────────────────┐
│ SERVER RUNTIME (Nitro / Node.js)                                              │
│                                                                               │
│  AKIRA OS Server Endpoints (src/akira-os/*/server/)                           │
│    • Dispatches to repositories; writes to SQLite                             │
│                                                                               │
│  Durable Persistence Layer (src/persistence/)                                 │
│    • better-sqlite3 with WAL mode, foreign keys enabled                       │
│    • Repositories: Project, Task, Note, Session, Vault, Conversation, Search  │
│    • Database file: %APPDATA%/AKIRA/akira.db (or custom AKIRA_DATABASE_PATH)  │
│                                                                               │
│  Server Event Pipeline (src/instrumentation/server/)                          │
│    • Receives persistPublishEvent RPC                                         │
│    • Publishes to server-side globalEventBus                                  │
│    • TimelineSubscriber writes to timeline_events table                       │
│    • PersistenceSubscriber writes to events table (write-only audit log)      │
│                                                                               │
│  ACCIDENTAL SERVER GENESIS:                                                   │
│    • SSR import of __root.tsx imports @/genesis, constructing a second        │
│      GENESIS pipeline on the server that accumulates in RAM and never persists │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Subsystem Breakdown & Actual Behavior

#### 1. Frontend / Backend Boundary
- **Client Side:** React SPA mounted on `#root`. Client code interacts with state through hooks (`useAkira`) and mutations through methods on the singleton `akira` object in `src/persistence/akira-store.ts`.
- **Server Side:** Server functions defined via `@tanstack/start-server-functions` (`createServerFn`). When client services (e.g. `src/akira-os/projects/services/`) invoke server actions, TanStack Start serializes the arguments and dispatches HTTP POST/GET requests to the server handler.
- **Isolation Rule:** Strict architectural rules (enforced by `MODULE_CONTRACT.md` and `scripts/claude/check-module-boundaries.mjs`) prevent any component, route, or client hook from importing `better-sqlite3`, repositories, or `persistence/connection`.

#### 2. GENESIS (Cognitive Subsystem)
GENESIS is 208 files located under `src/genesis/`. Its role is strictly cognitive:
- **Intake:** Listens to platform events via `RealityAdapter` (`src/genesis/events/reality-adapter.ts`). It deduplicates incoming events using an in-memory sliding FIFO (5,000 IDs) and maps 9 platform event types into cognitive `MemoryEvent`s.
- **Pipeline:** Runs 12 phase-ordered processors wired synchronously in `src/genesis/batch.ts`:
  1. `chatDeclarationPromoter` (captures goals from conversation)
  2. `candidateService` (evaluates 9 candidate rules)
  3. `validationEngine` (promotes, holds, or rejects candidates)
  4. `relationshipService` (links related memories, max 8 links per memory)
  5. `storyBuilder` (maintains ongoing project arcs and personal growth arcs)
  6. `importanceBuilder` (evaluates 6 importance signals)
  7. `identityBuilder` (extracts traits, interests, and declared values)
  8. `understandingEngine` (builds higher-level semantic understanding nodes)
  9. `insightEngine` (identifies cross-cutting patterns and commitments)
  10. `contextBuilder` (assembles `ContextPackage` with 12 recall slots)
  11. `retentionService` (applies memory retention caps: Core 2,000, Episodic 750)
  12. `realityAdapter` (maintains reality alignment)
- **Model Interaction:** GENESIS does *not* call the model during its internal derivation. The LLM is only called during explicit conversation turns via `aiContextEngine.executeRequestStream`.

#### 3. Memory System
- **Two Memory Stores:**
  - `CoreMemoryStore`: High-importance declarative memories, caps at 2,000 entries.
  - `EpisodicMemoryStore`: Time-stamped event memories, caps at 500 runtime / 750 durable entries.
- **Reconstruction:** Memory is reconstructed from the persisted JSON event stream (`settings.genesis_memories`). On boot, `memoryService.initialize()` clears memory and replays all historical events. Note: memory IDs are regenerated during replay.

#### 4. Identity System
Currently exists in two separate, unmerged forms:
- **Emergent Identity (`src/genesis/understanding/identity-service.ts`):** Case-sensitive string matching over observations derived from stories and declarations. Stored in memory; cleared and rebuilt on replay.
- **Foundation Identity (`src/genesis/identity/`):** Graph-based structured identity (nodes, edges, confidence, evidence). Case-insensitive. Singleton `InMemoryIdentityRepository` lives for the process lifetime and is never cleared. `personalDeclarationRule` writes into it on every boot.

#### 5. Context Engines
- `contextBuilder` (`src/genesis/context/context-builder.ts`): Assembles the `ContextPackage` (12 recall slots, 3 reserved for authored memories).
- `contextResolutionService` (`src/genesis/context/context-resolution/service.ts`): Combines presence, companion state, relationships, habits, and reflection into `[RESOLVED CONTEXT]`.
- `companionStateService` (`src/genesis/context/state/service.ts`): Tracks active project, focus, and open goals. Inverted lifecycle authority: `bootstrap()` starts memory replay; `closeSession()` disposes validation and recall.
- `HistoricalRecallProvider`: Queries SQLite `chat_messages` via FTS5 `bm25` search when a query is about past conversations.

#### 6. Goals & Missions
- **Goals:** Severely fragmented across ~9 distinct representations (project arcs, `IdentityGoal`, understanding goal nodes, `goalRule`, emergent aspirations, `companionState.activeGoals`, intent categories, planning objects). No canonical entity.
- **Missions:** Confirmed: **no mission engine, workflow runner, or command router exists**. The route `/daily-mission` simply redirects to `/tasks`, and `MISSION_COMPLETED` is an event fired when all workspace tasks are checked off.

#### 7. Projects & Tasks
- **Projects:** Handled by `src/akira-os/projects/` and `SqliteProjectRepository`. Soft deletion cleans up associations; past sessions are retained for 30 days before purging.
- **Tasks:** Handled by `src/akira-os/tasks/` and `SqliteTaskRepository`. Features user drag-and-drop reordering persisted via an explicit `position` column.

#### 8. Event Systems
AKIRA has multiple event mechanisms:
- **M1 (Platform Bus):** `src/instrumentation/event-bus.ts` (`globalEventBus`). Topic-less, supports synchronous delivery and async listeners.
- **M1a (Publisher Bridge):** `src/instrumentation/publisher.ts` sends non-transient events over RPC to the server.
- **M3 (Cognition Stream):** `genesis/events/event-service.ts` records `MemoryEvent`s in batched transactions.
- **M4 (Presence Channel):** Filtered view of platform presence events.

#### 9. Persistence & Storage
- **Engine:** SQLite 3 via `better-sqlite3`. WAL mode (`PRAGMA journal_mode = WAL`), foreign keys active (`PRAGMA foreign_keys = ON`).
- **Repositories:** `SqliteProjectRepository`, `SqliteTaskRepository`, `SqliteNoteRepository`, `SqliteSessionRepository`, `SqliteVaultRepository`, `SqliteConversationRepository`, `SqliteSearchRepository`, `SqliteEventRepository`.
- **Hydration:** Boot reads all rows via `getInitialStateRpc` and initializes `akira-store`.

#### 10. RPC Transport
- 47 TanStack Start `createServerFn` endpoints.
- Transport-only; 45 of 47 have identity TypeScript casts without runtime schema validation (only 2 Vault RPCs use zod).
- No authentication or authorization layer.

#### 11. Model & Provider Integration
- Integrated with Gemini (`GeminiProvider`) and OpenRouter (`OpenRouterProvider`).
- API calls originate directly from the browser using standard `fetch()`.
- API keys are retrieved from database settings and cached in browser memory.
- Streaming responses are handled in `chat.tsx` via `executeRequestStream`.

#### 12. Observability & Health
- `HealthRegistry`, `TelemetryStore`, `EventBusDeliveryObserver` in `src/observability/`.
- Validated via `scripts/verify-observability-reachability.ts` against bundle tree-shaking regressions.

---

## 3. Major Work Already Completed

The codebase reflects an extensive sequence of deep recovery, stabilization, and hardening passes performed prior to this handoff.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             TIMELINE OF ACCOMPLISHED WORK                        │
├─────────────────┬────────────────────────────────────────────────────────────────┤
│ Stage 1A / 1B   │ Recovered buildability: de-concatenated createHealthRuleEngine, │
│ (Early Sep)     │ created HealthyRule, event-adapter, resolved 103 TS errors.    │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Stage 1C        │ Restored 33 uncommitted files; made repository clean and safe.  │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Phase B         │ Reconciled event pipelines, repaired RealityAdapter, connected  │
│ (Mid Sep)       │ platform bus to GENESIS memory candidate intake.               │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ SQLite Migration│ Replaced localStorage state with SQLite WAL database. Created   │
│                 │ validate-architecture.ts with 363 automated test assertions.   │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Vault Hardening │ Closed path traversal security vulnerability in vault files,   │
│                 │ fixed folder UUID/int mismatch, introduced zod validation.     │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Deep Scan C3    │ Fixed Task reordering loss by introducing persisted `position` │
│ (Late Sep)      │ column, migration runner, and repository sort clauses.         │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Deep Scan C4    │ Fixed contact loss on reboot by reconstructing contacts from   │
│                 │ chat logs. Purged orphaned Goal and Knowledge engines.         │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Deep Scan C5    │ C5-01: Stopped deleted projects being described as active work.│
│                 │ Fixed confidence vs certainty confusion; stripped internal IDs.│
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Deep Scan C6    │ C6-01: Fixed mid-session delete crash wedging persistence.     │
│                 │ C6-02: Added companion state fact retraction.                  │
│                 │ C6-03: Added 30-day session retention for deleted projects.    │
│                 │ C6-04: Fixed boot-fabricated focus-switch habit.               │
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Chat Storage &  │ Migrated chat archive to first-class SQLite rows with FTS5.    │
│ Historical Recall│ Integrated HistoricalRecallProvider for past conversation recall.│
├─────────────────┼────────────────────────────────────────────────────────────────┤
│ Final E2E Suite │ Created production-journey.test.ts (multi-session restart proof)│
│                 │ Suite reached 130 test files / 1,366 passing vitest tests.     │
└─────────────────┴────────────────────────────────────────────────────────────────┘
```

---

## 4. Important Fixes Already Made (Detailed Audit)

| Fix Area | Problem Addressed | What Was Changed | Why Changed | Evidence & Tests | Working Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Task Ordering** | Drag-and-drop reorder in UI was lost on app reload. | Added `position INTEGER` to `tasks` table, updated `SqliteTaskRepository` to sort by `position ASC`, updated `reorderTasks` in `akira-store.ts`. | User expectations of persistent task priorities. | `tests/task-order-persistence.test.ts`, `src/persistence/task-position-migration.test.ts` | **PERMANENT** |
| **Session FK Crash** (C6-01) | Deleting a project during an active work session broke all future session saves with SQLite Foreign Key constraint failures. | In `projectsService.delete`, explicitly cleared `active_session` setting when matching the deleted project. | Prevented permanent database write wedges. | `tests/session-project-deletion.test.ts`, commit `20a0211` | **PERMANENT** |
| **Companion State Retraction** (C6-02) | Deleting the only active project left Companion State claiming "Active Project: X" and "Focus: Building" in prompts indefinitely. | Added retraction logic to `companionStateService.subscribeToStore` to withdraw project/focus claims when projects are removed. | Prevented prompt hallucinations of non-existent work. | `tests/companion-state-retraction.test.ts`, commit `06dec33` | **PERMANENT** |
| **Session History Retention** (C6-03) | `ON DELETE CASCADE` in database schema erased all past session history when a project was deleted, contradicting UI state. | Replaced cascade with 30-day retention (`retained_until` timestamp) and background purge. | Preserves user effort logs while honoring clean project deletion. | `tests/session-history-retention.test.ts`, `tests/session-history-purge.test.ts`, commit `5b2aa55` | **PERMANENT** |
| **Boot Habit Fabrication** (C6-04) | Initial app launch falsely created a "Workspace Focus Switch" habit because hydration ran after habit initialization. | Guarded `habitService` against hydration transitions; habit detection only triggers on true user-initiated switches. | Eliminated spurious cognitive habits. | `tests/habit-boot-restoration.test.ts`, commit `f26e50b` | **PERMANENT** |
| **Deleted Project Understanding** (C5-01) | Deleted projects remained in the Understanding graph as "actively building". | RealityAdapter now translates `PROJECT_DELETED` events; Understanding rules archive corresponding understanding nodes. | Ensures prompt accurately reflects current user reality. | `tests/genesis-deleted-project-claims.test.ts`, `tests/genesis-deletion-archives-understanding.test.ts` | **PERMANENT** |
| **Contact Loss on Restart** | Contacts (`@mentions`) were wiped on reboot and never restored because `lastProcessedChatTime = Date.now()`. | Modified `relationshipService` to scan existing chat messages on startup to reconstruct contacts. | Restores social context seamlessly across sessions. | `tests/genesis-context-restart.test.ts`, commit `88f78dd` | **PERMANENT** |
| **Prompt Internal Leakage** | Prompt contained raw UUIDs, telemetry metadata, and duplicated memory listings. | Sanitized prompt builders in `prompt-builder.ts` to output clean, readable context without system IDs. | Improves model inference quality and eliminates token waste. | `tests/genesis-prompt-no-internal-ids.test.ts`, `tests/genesis-prompt-layer-duplication.test.ts` | **PERMANENT** |
| **Observability Tree-Shaking** | `auto-compose.ts` was tree-shaken from production builds because `package.json` had `"sideEffects": false`. | Explicitly declared `auto-compose.ts` in `sideEffects` array; added reachability guard script. | Ensures production builds retain health monitoring and telemetry. | `scripts/verify-observability-reachability.ts`, commit `8b93ff4` | **PERMANENT** |
| **Historical Recall** | System had no way to search past conversation history; chat was lost in a single JSON blob. | Added `chat_messages` table with SQLite FTS5 `bm25` search; added `HistoricalRecallProvider`. | Allows AKIRA to recall prior discussions when queried. | `tests/conversation-storage.test.ts`, `tests/historical-search-intent.test.ts`, commit `436a5fc` | **PERMANENT** |

---

## 5. Current Architecture Map & Subsystem Classification

Every major subsystem is classified under the governing architectural taxonomy:

| Subsystem / Area | Path / Location | Classification | Evidence & Justification |
| :--- | :--- | :--- | :--- |
| **Database & Repositories** | `src/persistence/repositories/`, `connection.ts` | **CURRENT AND HEALTHY** | Robust SQLite layer using WAL mode and transactions; passes 363 architecture validation checks. |
| **Core GENESIS Memory** | `src/genesis/{memory, candidate, validation, stories, importance, recall}` | **CURRENT AND HEALTHY** | 12-stage cognitive pipeline operates correctly; verified with rigorous unit and integration tests. |
| **Understanding & Insights** | `src/genesis/understanding/`, `src/genesis/insights/` | **CURRENT AND HEALTHY** | Accurately generates cognitive models and observations; deletion retraction verified. |
| **Historical Recall & FTS5** | `src/akira-os/conversations/`, `src/contracts/historical-recall.ts` | **CURRENT AND HEALTHY** | First-class SQLite rows with FTS5 bm25 indexing; provider registered and passing 65 intent tests. |
| **App Shell & Presentation** | `src/app/` (`Shell`, `Sidebar`, `Topbar`, `CommandPalette`) | **CURRENT AND HEALTHY** | Clean React presentation components complying with `MODULE_CONTRACT.md`. |
| **akira-store Hub** | `src/persistence/akira-store.ts` | **CURRENT BUT TEMPORARY** | Monolithic client store holding workspace data, open chat, and memory stream; client-authoritative. Will be refactored when capabilities take ownership. |
| **Browser Cognition Residency** | `src/genesis/` (executed in browser) | **CURRENT BUT TEMPORARY** | Cognition currently lives in the browser tab. Will be migrated or adapted when server-authoritative runtime (O1) is implemented. |
| **Server Functions (47 RPCs)** | `src/akira-os/*/server/index.ts` | **CURRENT BUT TEMPORARY** | Raw transport mechanism lacking authentication and input schemas. Will be fronted by capability contracts. |
| **Reality Adapter** | `src/genesis/events/reality-adapter.ts` | **CURRENT BUT TEMPORARY** | Pure translation table covering only 9 of 98 event types. Needs expansion during vocabulary split. |
| **Route Controllers** | `routes/chat.tsx`, `routes/__root.tsx` | **CURRENT BUT TEMPORARY** | Routes currently hold boot sequences, memory replay triggers, and turn orchestration. Must become pure view controllers. |
| **Legacy LocalStorage Migration** | `src/persistence/migration-impl.ts`, `routes/__root.tsx` | **LEGACY** | Temporary migrator for legacy browser installs. Retained until legacy deprecation. |
| **Sessions Subsystem** | `src/akira-os/sessions/` | **PARTIALLY MIGRATED** | 30-day retention and DB integrity fixed, but session start/end is still driven by UI side effects and store methods. |
| **Timeline Subsystem** | `src/akira-os/timeline/` | **PARTIALLY MIGRATED** | Dual write path (DB triggers + TimelineSubscriber) creates duplicate events. |
| **Conversations Subsystem** | `src/akira-os/conversations/` | **PARTIALLY MIGRATED** | History is in SQLite, but active conversation state is still managed inside `chat.tsx`. |
| **Accidental Server GENESIS** | SSR import of `__root.tsx` -> `@/genesis` | **CONFLICTS WITH FROZEN ARCHITECTURE** | Accidental second GENESIS instance running on the server without persistence. Must be removed (P0 #52). |
| **Route-Driven Memory Replay** | `routes/__root.tsx:242`, `chat.tsx:591` | **CONFLICTS WITH FROZEN ARCHITECTURE** | New Chat triggers full memory replay and disposes validation. Violates Decision D3 (New Chat is a conversation boundary, not a reset). |
| **Identity Store Duplication** | `understanding/identity-service.ts` vs `genesis/identity/` | **CONFLICTS WITH FROZEN ARCHITECTURE** | Dual identity stores with conflicting lifecycles and case matching. Violates Decision to have one canonical Identity System. |
| **Generic Settings RPCs** | `persistGetSetting`, `persistSetSetting` | **CONFLICTS WITH FROZEN ARCHITECTURE** | Generic key-value endpoints expose plaintext API keys and memory blobs without access control. |
| **Platform Runtime Module** | `src/runtime/` (37 files, 2,872 LOC) | **DEAD / UNUSED** | Plugin host architecture designed for a plugin system AKIRA does not use. Unreachable from production. |
| **Analytics Subsystem** | `src/analytics/` (29 files, 3,458 LOC) | **DEAD / UNUSED** | Unreachable from production. Event table metrics deferred to later phase. |
| **Legacy SDK & Compatibility** | `src/sdk/` (14 files), `src/compatibility/` (16 files) | **DEAD / UNUSED** | Superseded by capability architecture. Unreachable from production. |
| **Planning, Reasoning, Decision** | `src/genesis/{planning, reasoning, decision}` | **DEAD / UNUSED** | 15 singletons constructed at import but never invoked by production paths. |
| **Duplicate Shared Utilities** | `src/shared/error/*`, `src/shared/utilities/utils.ts` | **DEAD / UNUSED** | Byte-identical copies of files in `src/lib/`. Zero importers. |

---

## 6. Frozen Target Architecture Understanding

The target architecture is fully specified across the governing documents and must be treated as **authoritative and frozen**:

### 6.1 Subsystem Ownership & Boundaries
1. **GENESIS (Cognition):**
   - Answers: *What does AKIRA know, remember, understand, and infer?*
   - Consumes: Domain **Events** (from AKIRA OS), cognitive **Queries** (from VAJRA / authorized readers).
   - Produces: **Results** (answers to queries) and **Observations** (cognitive evidence, recommendations with confidence and provenance).
   - Invariant: **GENESIS accepts NO Commands** (Rule N3) and issues NO Commands to other subsystems. It mutates cognitive state only through processing events and internal lifecycles.
2. **VAJRA (Authority & Orchestration):**
   - Answers: *What should happen, using which capabilities, and has it succeeded?*
   - Control Loop: `UNDERSTAND -> PLAN -> SELECT -> COORDINATE -> VERIFY`.
   - Owns: Canonical operational Goals, Missions, mission state, cross-system decisions, capability selection and routing, and verification.
   - Invariant: VAJRA is **not** an execution engine; it delegates execution via capability Commands.
3. **HANDS (Controlled Execution):**
   - Answers: *How is this concrete external action executed?*
   - Interfaces: External environments (terminals, local CLI tools, Antigravity, Claude, browser automation).
   - Invariant: HANDS accepts Commands **only from VAJRA**. HANDS emits Execution Results and Observations. Execution $\neq$ verification.
4. **AKIRA OS (Infrastructure & Platform):**
   - **Platform Plane:** Storage infrastructure, system/runtime lifecycle, capability registration and activation, transport, health, secrets.
   - **Domain Plane:** Workspace peer capability owner (projects, tasks, notes, sessions, vault, search, timeline, conversations).
5. **MCP (External Gateway):**
   - External interface exposing read-only capabilities in v0.
   - Invariant: MCP is an interface, not an authority. It never bypasses capabilities to touch SQLite, files, or GENESIS internals directly.

### 6.2 The Five Core Communication Primitives

```
┌──────────────┬──────────────────┬─────────────────┬─────────────────────────────────────────┐
│ Primitive    │ Tense / Mood     │ Addressed To    │ Core Contract / Behavior                │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────┤
│ COMMAND      │ Imperative       │ Exactly one     │ "Do this." May mutate owner state.      │
│              │ ("Do this")      │ capability owner│ Returns Result. Typically yields Event. │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────┤
│ QUERY        │ Interrogative    │ Exactly one     │ "Tell me this." Must not mutate domain  │
│              │ ("Tell me this") │ capability owner│ state. Returns Result with data.        │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────┤
│ EVENT        │ Past Fact        │ No addressee    │ "This happened." Emitted ONLY by state  │
│              │ ("X happened")   │ (Subscribers)   │ owner. Never requests an action.        │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────┤
│ OBSERVATION  │ Evidential       │ Authority       │ "Here is evidence/state I observed."    │
│              │ ("I observed X") │ (usually VAJRA) │ Carries confidence & provenance.        │
├──────────────┼──────────────────┼─────────────────┼─────────────────────────────────────────┤
│ RESULT       │ Correlated Reply │ Requesting      │ "Here is the outcome of your request."  │
│              │ ("Outcome of X") │ caller only     │ Execution Result vs Mission Result.     │
└──────────────┴──────────────────┴─────────────────┴─────────────────────────────────────────┘
```

### 6.3 Decided Boundary Rules: N1, N2, and N3
- **Rule N1 (Internal Command Authority):** An internal caller (such as the UI) may issue a single-owner Command directly without VAJRA mediation **if and only if** all 5 conditions hold:
  1. Explicit user instruction (not inferred).
  2. No cross-owner coordination.
  3. Outside any active Mission.
  4. Admitted by the capability's `permissions`.
  5. Target is neither a HANDS nor a GENESIS capability.
- **Rule N2 (Non-VAJRA Tier-2 Activation):** A permitted invocation by an authorized non-VAJRA caller of a registered, available, inactive Tier 2 capability counts as a requirement that permits AKIRA OS to activate it on-demand or decline under resource management.
- **Rule N3 (GENESIS Command Freedom):** GENESIS exposes **only Query capabilities**. No subsystem or external caller may send a Command to GENESIS. Cognitive state is derived exclusively from domain Events, user conversation input, and internal reconstruction lifecycles.

### 6.4 Key Architectural Distinctions
- **Goal vs. Mission:** A Goal is a durable desired outcome (e.g. "Build an FPGA compiler"). A Mission is a bounded, operational unit of work with completion criteria (e.g. "Draft the pin-assignment constraints"). A Mission does not require a Goal.
- **Workspace Tasks vs. Mission Steps:** A Task is a user-managed workspace item owned by AKIRA OS. A Mission Step is VAJRA's internal execution step.
- **Execution vs. Completion:** An action executed successfully by HANDS does not mean the mission succeeded. Only VAJRA can verify completion against criteria.
- **New Chat vs. Reset:** New Chat is a conversation boundary owned by `akira-os/conversations`. It resets conversation-scoped focus only. It **never** triggers memory replay, never clears identity, and never reboots GENESIS.

---

## 7. Current → Target Gap Map

| Architectural Area | Current Implementation | Target Frozen Behavior | Required Migration | Dependencies | Risk | Target Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Capability Boundary** | UI imports client services; client services call 47 unauthenticated RPCs. | All operations routed via formal Capability Catalogue (`contracts/capabilities/`). | Wrap existing RPCs and repositories behind named Command/Query descriptors with input/output schemas. | None | Low | **Phase 3** (Immediate Next) |
| **Uniform Result Contract** | `persist` swallows errors; ad-hoc `{ success: boolean }` shapes. | Uniform `Result<T, E>` envelope for all capabilities with typed error categories. | Implement Result envelope in `contracts/results/`; update capability handlers. | Phase 3 Capability Catalogue | Low | **Phase 3 / Phase 6** |
| **Accidental Server GENESIS** | `__root.tsx` SSR import causes `@/genesis` to compose on server. | Cognition instantiated intentionally in exactly one authoritative location. | Guard `@/genesis` composition against server-side SSR execution or decouple SSR bundle. | Decision O1 (Runtime placement) | Low | **Phase 1 cleanup** |
| **New Chat Lifecycle** | `chat.tsx` calls `closeSession` + `bootstrap`, running full memory replay on every New Chat. | New Chat creates a conversation boundary in AKIRA OS; memory and identity persist untouched. | Decouple New Chat in `chat.tsx` from `companionStateService.bootstrap`; emit conversation-boundary event. | Conversations module ownership | Medium | **Phase 4 / 5** |
| **Memory Stream Ownership** | `akira-store` holds `settings.genesis_memories` blob and applies retention rules. | GENESIS Memory System is sole semantic owner and writer; persistence is storage provider only. | Move `applyDurableRetention` completely into GENESIS; store provides raw storage contract. | Memory contracts | Medium | **Phase 4** |
| **Identity Consolidation** | Two separate stores: Emergent (RAM/cleared on replay) and Foundation (process/never cleared). | One canonical, evidence-based Identity System with a unified read model (`identity.read`). | Merge read models behind an adapter; stop `personalDeclarationRule` direct writes. | Identity decision (O4) | Medium | **Phase 4** |
| **Turn Orchestration** | `chat.tsx handleSend` manages prompt composition, provider dispatch, history recording, and session timing. | Turn orchestrator outside the UI coordinates cognitive queries, workspace context, and model dispatch. | Extract `handleSend` orchestration into an application service; route mounts pure container. | Capabilities | Medium | **Phase 4** |
| **Model Transport Seam** | Browser `fetch` in `genesis/context/ai/providers/` holds API keys in client settings. | Independent model transport infrastructure service in AKIRA OS platform plane. | Extract AI providers from `src/genesis/context/ai/` into platform service. | Model transport decision (O9) | High | **Phase 4 / 8** |
| **Authoritative Runtime Placement** | Cognition in browser; DB on server. External agents cannot reach browser RAM. | Single authoritative live runtime (Option B: server-authoritative). | Host GENESIS and authority in local background server process; browser becomes UI cache. | Deployment target (O1) | High | **Future Runtime / MCP** |
| **VAJRA Mission Engine** | Does not exist. | VAJRA coordinates missions via UNDERSTAND -> PLAN -> SELECT -> COORDINATE -> VERIFY. | Implement VAJRA subsystem in `src/vajra/`. | Capabilities & Contracts | High | **VAJRA Phase** |
| **HANDS Execution Engine** | Does not exist. Model output is pure text. | Controlled execution adapters for terminal, CLI, and external tools. | Implement HANDS subsystem in `src/hands/`. | VAJRA | High | **HANDS Phase** |
| **MCP Server Gateway** | Does not exist. | Read-only MCP v0 server exposing capabilities to external agents. | Implement MCP protocol adapter over Phase 3 Query capabilities. | Phase 3 Capabilities & O1 | Medium | **MCP v0 Phase** |

---

## 8. Legacy and Temporary Areas

### 8.1 Dead & Unused Code (Candidates for Deletion PRs)
The following components are dead, unreached from production entrypoints, and do not contribute to working functionality:
- `src/runtime/` (37 files, 2,872 LOC): An obsolete module/plugin system.
- `src/analytics/` (29 files, 3,458 LOC): Unreachable metric aggregators.
- `src/sdk/` (14 files, 378 LOC): Superseded client SDK.
- `src/compatibility/` (16 files, 353 LOC): Unused adapters.
- `src/genesis/{planning, reasoning, decision}/`: Loaded but unused cognitive experiments.
- `src/shared/error/*` and `src/shared/utilities/utils.ts`: Byte-identical duplicates of `src/lib/` files.
- `akira.sendChat` (`src/persistence/akira-store.ts:834`): Dead mock chat generator.
- `akira.addTask` (`src/persistence/akira-store.ts:490`): Uncalled action that fails to persist.

*Note:* Per AGENTS.md and P0 recommendations, **do not bundle deletions into capability PRs**. Deletions should occur as dedicated, independent PRs of under 400 lines each.

### 8.2 Temporary Bridging Code (Must Be Preserved Until Phase Completion)
- `akira-store.ts` write-through logic: Currently the only mechanism updating UI components reactively. Must remain until capabilities and reactive change feeds are built.
- `RealityAdapter` event translation table: Currently the sole conduit from workspace mutations to GENESIS.
- `HistoricalRecallProvider` registration in `src/akira-os/conversations/`: Bridges chat archive FTS5 to GENESIS context engine.

---

## 9. Risks and Uncertainties (Open Questions O1–O12)

The Target Architecture explicitly tracks 12 open questions that must be resolved incrementally:

1. **O1: Authoritative Runtime Placement:** Whether the primary runtime lives in the browser (current), a local server process (Option B), or desktop shell (Electron/Tauri). *Impact: Determines how MCP and HANDS access memory.*
2. **O2: Workspace Write Authority:** Whether the client store remains authoritative or is demoted to a read cache fed by server events.
3. **O3: Goal & Mission Schema:** The exact entity schema, status enums, and relationships to Projects/Tasks.
4. **O4: Identity Consolidation:** Which identity structures are durable vs. derived, and whether the two stores physically merge.
5. **O6: Reset Semantics:** How a deliberate user reset reaches SQLite, the memory stream, and in-memory caches.
6. **O7: Conversation-Turn Lifecycle:** Whether an individual chat turn is modeled as a lightweight Mission or a distinct operational interaction.
7. **O7r: Legacy Runtime Harvesting:** What specific patterns (e.g. topological dependency sorting) are harvested from `src/runtime` before deletion.
8. **O8 / O8a: Persistence Mechanics:** Whether derived cognition is persisted or always reconstructed by replay.
9. **O9: Model Transport Placement:** Whether LLM dispatch lives in AKIRA OS platform plane or a dedicated gateway service.
10. **O10: Registry Implementation Location:** Where the physical capability registry code resides (`contracts/` vs `akira-os/`).
11. **O11: Domain Event Log Durability:** Whether a durable, append-only event log table is required.
12. **O12: External Authentication:** Mechanism and timing of external API token authentication for MCP.

---

## 10. Recommended Phase 3 Starting Point

Based on the migration strategy defined in `AKIRA-TARGET-ARCHITECTURE.md` §16 and `AKIRA-ARCHITECTURE-DISPOSITION.md` §15, **the recommended starting point for the next phase is Phase 3: Capability Boundaries & Catalogue**.

### Why Phase 3 First?
- It builds the foundational layer needed by both **VAJRA** (which reasons exclusively in capabilities) and **MCP** (which exposes read capabilities).
- It introduces zero disruption to existing UI or GENESIS cognition internals.
- It can be implemented cleanly under `src/contracts/capabilities/` and `src/contracts/results/`.

### Recommended Step-by-Step Execution Plan for Phase 3:
1. **Define the Result Contract:**
   - Implement the uniform `Result<T, E>` envelope under `src/contracts/results/`.
   - Define canonical error categories (`validation_error`, `not_found`, `unauthorized`, `conflict`, `system_error`).
2. **Define the Capability Descriptor Type:**
   - Implement the TypeScript schema for capability metadata (`name`, `version`, `owner`, `kind: 'Command' | 'Query'`, `inputSchema`, `outputSchema`, `permissions`, `tier`).
3. **Register Read Capabilities for Existing Domain Owners:**
   - `project.read`, `project.list`
   - `task.read`, `task.list`
   - `note.read`, `note.list`
   - `session.current`, `session.list`
   - `conversation.search`
   - `workspace.search`
4. **Implement Capability Execution Adapters:**
   - Wrap the existing SQLite repositories behind the capability contracts.
   - Enforce schema validation on inputs using Zod.
5. **Add Comprehensive Tests:**
   - Create unit tests for every registered capability verifying input validation, output shaping, and error envelope handling.

---

## 11. Evidence & Tests Supporting the Current State

The current system state is strictly verified by an extensive, passing automated suite:

```bash
# 1. Vitest Test Suite: 130 test files, 1,366 tests passing
npm run test:run

# 2. Architectural Boundary & Integrity Checks: 363 assertions passing
npm run validate:architecture

# 3. Observability Production Bundle Reachability:
npm run verify:observability

# 4. Strict TypeScript Type Check:
npm run type-check

# 5. End-to-End User Multi-Session Journey:
npx vitest run tests/production-journey.test.ts
```

### Key Reference Tests to Study:
- `tests/production-journey.test.ts`: Complete user lifecycle simulation verifying project creation, task ordering, active sessions, deletion, fact retraction, and restart recovery.
- `tests/task-order-persistence.test.ts`: Proves user task ordering persists across reboots.
- `tests/session-project-deletion.test.ts`: Proves mid-session project deletion does not crash SQLite foreign keys.
- `tests/companion-state-retraction.test.ts`: Proves companion state retracts deleted project claims.
- `tests/session-history-retention.test.ts`: Proves deleted projects retain session history for 30 days.
- `tests/habit-boot-restoration.test.ts`: Proves boot hydration does not fabricate fake focus-switch habits.
- `tests/historical-search-intent.test.ts`: Proves intent detection and FTS5 retrieval over conversation history.
- `tests/support/perf-ab.ts`: Interleaved A/B benchmark harness for statistically valid performance assertions.

---

## 12. WHAT I WOULD NOT TOUCH

The following components and subsystems represent **hard-won, fully verified, and fragile engineering victories**. They must **NOT** be casually refactored, cleaned up, or modified:

1. **The SQLite Repository & Connection Layer (`src/persistence/repositories/`, `src/persistence/connection.ts`):**
   - Configured with WAL mode, busy timeouts, and active foreign keys. Modifying connection initialization risks deadlocks and corruption.
2. **The Task Position Ordering Logic (`src/persistence/repositories/SqliteTaskRepository.ts`, `src/persistence/akira-store.ts:reorderTasks`):**
   - The `position` column and its `ORDER BY position ASC, created_at ASC` queries were introduced specifically to resolve silent data loss on drag-and-drop.
3. **The 30-Day Session History Retention Mechanism (`src/persistence/repositories/SqliteProjectRepository.ts`, `SqliteSessionRepository.ts`):**
   - Replacing the cascade deletion with `retained_until` and background purging fixed a critical divergence between disk and UI memory.
4. **The Reality Adapter Deletion Handlers (`src/genesis/events/reality-adapter.ts`, `src/genesis/events/event-translation.ts`):**
   - Maps `PROJECT_DELETED` and other deletions into cognitive events. Removing this immediately re-introduces prompt hallucinations where AKIRA claims the user is working on deleted projects.
5. **The Hydration Guard in Habit Service (`src/genesis/context/habits/service.ts`):**
   - Protects against boot-time focus switch fabrication. Changing the initialization order causes every app launch to fabricate spurious habits.
6. **The Observability Auto-Compose Build Guard (`package.json`, `scripts/verify-observability-reachability.ts`):**
   - The explicit `sideEffects: ["src/observability/auto-compose.ts"]` declaration prevents Rollup from stripping telemetry out of the production build.
7. **The Historical Recall FTS5 Search Integration (`src/persistence/repositories/SqliteConversationRepository.ts`, `src/contracts/historical-recall.ts`):**
   - Uses parameterized FTS5 `bm25` queries to search past messages without token blowup.
8. **The Module Boundary Linter Hook (`scripts/claude/check-module-boundaries.mjs`):**
   - Enforces that UI components and routes never import repositories or SQLite directly.
9. **The Frozen Architecture Specifications (`docs/architecture/`):**
   - `AKIRA-TARGET-ARCHITECTURE.md`, `AKIRA-FOUNDATION-CONTRACTS.md`, and the N1, N2, N3 decision records are frozen and accepted. Do not reopen settled contracts.
10. **The Production Journey Test (`tests/production-journey.test.ts`):**
    - The master canary test for AKIRA. If this test fails, an invariant in the cross-system state machine has been broken.
