# Event Pipeline Remediation Design

**Program:** AKIRA Foundation Recovery
**Type:** Implementation-ready remediation design. **No source file was modified.**
**Date:** 2026-09-03
**HEAD:** `b561730`
**Predecessor:** `docs/recovery/phase-b-event-architecture-reconciliation.md` (investigation)

**Relationship to Phase B.** Phase B established the split-bus defect and recommended Option B. This document does not restate that evidence; it **independently re-verified** the load-bearing claims, then went further to produce specifications an implementer can execute. Two findings below are new and materially change the scope of the fix (§6.3, §7.2).

---

## 1. Executive Summary

GENESIS is disconnected from reality by **four independent severances**, not one. Each blocks the flow on its own, so repairing any subset changes nothing observable.

| # | Severance | Location | Status |
| :-- | :--- | :--- | :--- |
| S1 | Workspace events publish to the instrumentation bus; GENESIS subscribes to the legacy bus | `instrumentation/` vs `shared/infrastructure/event-bus/` | Phase B |
| S2 | `Events.TASK_COMPLETED` resolves to `planning.task.completed`, not the published `task.completed` | `contracts/events.ts:76-77` | Phase B, **re-verified** |
| S3 | Publisher emits `note.updated`; every consumer expects `note.edited` | `akira-store.ts:469` | Phase B |
| **S4** | **`Memory → Story` and `Memory → Importance` are dead: the builders that subscribe them are in barrels the production graph never imports** | `genesis/stories/index.ts`, `genesis/importance/index.ts` | **NEW — this document** |

**S4 is the finding that changes the plan.** Phase B's remediation ends at "completing a task produces a memory." That milestone is now demonstrably insufficient: even with a perfect event boundary, memories would never become stories or importance signals, and the narrative layer that `context-builder` feeds to the AI prompt would stay empty. Reconnecting the buses is **necessary but not sufficient**.

**The offsetting good news, established empirically (§6.2):** everything downstream of `eventService.record()` that *is* wired works correctly on the first try. One well-formed `task_completed` event produced 1 candidate, 1 validated memory and 2 understandings with no code changes. **This is a connection defect, not a cognition defect** — which bounds the work sharply and is the single most important input to sizing this effort.

**Recommendation.** Adopt Phase B's **Option B** (platform bus + a GENESIS reality adapter), extended with an S4 repair and a mandatory **reachability test class** that prevents this defect category from recurring. Sequenced in six phases (§11), contract-first, with the cutover gated behind a dual-run measurement phase.

**Critical timing constraint, unchanged from Phase B and re-confirmed:** `events.type` stores raw event strings and the live table holds **1 test row, 0 timeline rows**. Renaming is free today and expensive the moment real events flow. **The contract must be fixed before the buses are connected**, not after.

---

## 2. Current Event Architecture

### 2.1 The two buses

| | Legacy bus | Instrumentation bus |
| :--- | :--- | :--- |
| File | `shared/infrastructure/event-bus/index.ts` | `instrumentation/event-bus.ts` |
| Subscribe by | topic string, **or `"*"` wildcard** | subscriber object `{id, onEvent}` — **no wildcard** |
| Envelope | `{type, payload, timestamp}` | `AkiraEvent` (id, type, source, timestamp, version, correlationId, entityId, actor) |
| Persistence | none | via `PersistenceSubscriber` → `events` table |
| Error posture | per-subscriber `try/catch` → `console.error` | same |
| Production traffic | **`presence.updated` only** | 25 types / 26 sites |

The asymmetry in row 2 is the hard constraint on any merge: **GENESIS's `subscribe("*")` has no equivalent on the instrumentation bus.** Any unification forces GENESIS to register a concrete subscriber and filter internally — i.e. an adapter appears whether or not it is named. The design below names it.

### 2.2 Flow as it actually executes

```
USER ACTION
   │
   ├─► akira-store.set() ──► React state                                    WORKING
   │
   ├─► publish({type:"task.completed", …})            instrumentation/publisher.ts
   │      ├─ middleware (id, ts, correlationId, validate)                   WORKING
   │      ├─ client globalEventBus.publish()  → 0 subscribers               DEAD END
   │      └─ persistPublishEventRpc  ──HTTP──►  server
   │              ├─► PersistenceSubscriber  ──► events table               UNTESTED
   │              ├─► TimelineSubscriber (22-type allowlist)                UNTESTED
   │              └─► AnalyticsSubscriber        NEVER REGISTERED           BROKEN
   │
   └─► import("../akira-os/x").then(svc => svc.add(...))  ──► SQLite        WORKING
                                                          (un-awaited, no .catch)

        ╔═══════════════════════════════════════════════════════╗
        ║  S1: NO EDGE FROM ANY OF THE ABOVE TO GENESIS         ║
        ╚═══════════════════════════════════════════════════════╝

presenceService ──► eventBus.publish("presence.updated")     LEGACY BUS
   ├─► companionStateService                                              WORKING
   ├─► contextResolutionService ×2                                        WORKING
   ├─► genesis eventService "*"  ──► record("presence_updated")           WORKING
   │        └─► candidateService  ──► no rule matches                     DEAD END
   └─► async bridge ──► instrumentation   EXCLUDED for presence.updated   BROKEN
```

### 2.3 The one bridge, and why it does not help

`shared/infrastructure/event-bus/index.ts:61-77`. Direction **legacy → instrumentation**, one-way, asynchronous (`import().then()`), with `.catch(() => {})` plus an outer `try/catch` — two layers of total error suppression. It excludes `presence.updated`, which is the only type that travels on the legacy bus in production.

It therefore forwards nothing, and even if it forwarded everything it would be pushing events *away* from GENESIS. **The bridge is orthogonal to the defect.**

### 2.4 A third thing named "event adapter" — disambiguation

`src/compatibility/adapters/event-adapter.ts` (staged by the parallel recovery stream) is **not** the GENESIS boundary. It is a thin SDK/module wrapper delegating `publish`/`subscribe` to `RuntimeAdapter.events`, satisfying `SDK EventAPI` and `IModuleEventBus`.

**Design constraint:** the new component in §8 must **not** be called `EventAdapter` or live under `compatibility/adapters/`. This document uses `RealityAdapter` at `src/genesis/events/reality-adapter.ts`. Two differently-purposed files called "event adapter" in one repository is exactly the kind of ambiguity that produced the current situation.

---

## 3. Event System Census

### 3.1 Systems

| # | System | Location | Producers | Subscribers | Persisted | Reaches GENESIS |
| :-- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Instrumentation bus | `instrumentation/event-bus.ts` | 26 sites | 2 of 3 registered | ✅ `events` | ❌ |
| 2 | Legacy bus | `shared/infrastructure/event-bus/` | 15 (12 never fire) | 4 | ❌ | ✅ (1 type) |
| 3 | Event Store | `instrumentation/event-store/` | PersistenceSubscriber | replay readers | ✅ | ❌ |
| 4 | Timeline | `instrumentation/subscribers/timeline-subscriber.ts` | bus | — | ✅ `timeline_events` | ❌ |
| 5 | GENESIS MemoryEvent | `genesis/events/event-service.ts` | 77 internal + legacy `"*"` | candidateService | ❌ RAM only | n/a |
| 6 | Analytics subscriber | `instrumentation/subscribers/` | — | **never registered** | ❌ | ❌ |
| 7–15 | 9 local emitters | `genesis/context/*/events.ts` etc. | intra-GENESIS | each other | ❌ | n/a |
| 16 | Runtime lifecycle/capability | `runtime/*` | 12 sites | legacy bus | ❌ | ❌ |
| 17 | SDK/module event adapter | `compatibility/adapters/event-adapter.ts` | SDK modules | RuntimeAdapter | ❌ | ❌ |

### 3.2 Published event types — the full production census

26 call sites, 25 distinct types. **Every one is a bare string literal; `Events.*` is imported by `akira-store.ts` and never used.**

| Event | Declared in registry | Published by | Bus | Timeline | Persisted | Reaches GENESIS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `project.created` | ✅ | akira-store:119 | instr | ✅ | ✅ | ❌ S1 |
| `project.updated` | ✅ | akira-store:147 | instr | ✅ | ✅ | ❌ S1 |
| `project.deleted` | ✅ | akira-store:166 | instr | ✅ | ✅ | ❌ no case |
| `project.continued` | ✅ | akira-store:211 | instr | ✅ | ✅ | ❌ S1 |
| `task.created` | ❌ **shadowed** | akira-store:249,364 | instr | ✅ | ✅ | ❌ S1+S2 |
| `task.completed` | ❌ **shadowed** | akira-store:270 | instr | ✅ | ✅ | ❌ S1+S2 |
| `task.updated` | ✅ | akira-store:307 | instr | ✅ | ✅ | ❌ no case |
| `task.reopened` | ❌ undeclared | akira-store:287 | instr | ❌ | ✅ | ❌ |
| `task.deleted` | ✅ | akira-store:328 | instr | ✅ | ✅ | ❌ no case |
| `mission.completed` | ✅ | akira-store:279 | instr | ✅ | ✅ | ❌ S1 |
| `note.created` | ✅ | akira-store:441 | instr | ✅ | ✅ | ❌ S1 |
| `note.updated` | ❌ (registry has `note.edited`) | akira-store:469 | instr | ❌ **S3** | ✅ | ❌ S1+S3 |
| `note.deleted` | ✅ | akira-store:489 | instr | ✅ | ✅ | ❌ no case |
| `settings.updated` | ❌ undeclared | akira-store:607 | instr | ❌ | ✅ | ❌ |
| `session.started` | ✅ | akira-store:639 | instr | ✅ | ✅ | ❌ no case |
| `session.ended` | ✅ | akira-store:690 | instr | ✅ | ✅ | ❌ no case |
| `search.executed` | ❌ undeclared | search/services:90 | instr | ❌ | ✅ | ❌ |
| `vault.file.uploaded` | ✅ | VaultStorageService:170 | instr | ✅ | ✅ | ❌ no case |
| `vault.file.renamed` | ✅ | VaultStorageService:207 | instr | ✅ | ✅ | ❌ no case |
| `vault.file.moved` | ✅ | VaultStorageService:224 | instr | ✅ | ✅ | ❌ no case |
| `vault.file.deleted` | ✅ | VaultStorageService:282 | instr | ✅ | ✅ | ❌ no case |
| `vault.file.restored` | ✅ | VaultStorageService:327 | instr | ✅ | ✅ | ❌ no case |
| `vault.folder.created` | ✅ | VaultFolderService:17 | instr | ✅ | ✅ | ❌ no case |
| `vault.folder.deleted` | ✅ | VaultFolderService:62 | instr | ✅ | ✅ | ❌ no case |
| `vault.folder.moved` | ✅ | VaultFolderService:42 | instr | ✅ | ✅ | ❌ no case |
| `presence.updated` | ✅ | presence/service ×3 | **legacy** | ❌ | ❌ excluded | ✅ **but no rule** |

**Reaches GENESIS: 1 of 26. Produces cognition: 0 of 26.**

### 3.3 Contract drift summary

- **Published but undeclared (4):** `task.reopened`, `settings.updated`, `search.executed`, `note.updated`
- **Declared but never published (72 of 93):** 41 identity, 29 planning, `note.edited`, `presence.updated`
- **In the Timeline allowlist but never published (1):** `note.edited`
- **Published but not allowlisted (4):** `note.updated`, `task.reopened`, `settings.updated`, `search.executed`

---

## 4. Confirmed Failure Paths

### 4.1 Task completion — the product's most important action

```
User checks a task
  → akira.toggleTask()                                          WORKING
  → publish({type:"task.completed"})                            WORKING
  → middleware → client bus (0 subscribers) → RPC → server bus  UNTESTED
  → events table + timeline_events                              UNTESTED
  → GENESIS                                                     BROKEN  (S1)
  → even on a merged bus: case Events.TASK_COMPLETED
      = "planning.task.completed" ≠ "task.completed"            BROKEN  (S2)
  → memory / story / understanding                              UNREACHABLE
```

### 4.2 Presence — reaches GENESIS and still yields nothing

```
presence.updated → legacy bus → GENESIS "*" → record("presence_updated")   WORKING
  → candidateService.evaluateEvent()                                       WORKING
  → 7 candidate rules, none matches "presence_updated"                     DEAD END
  → never persisted (bridge excludes it)                                   BROKEN
```
Verified by probe: recording `presence_updated` left the candidate count unchanged.

### 4.3 Note editing — invisible to every consumer

`note.updated` is published; the registry, the Timeline allowlist, GENESIS's `switch` and a candidate rule all say `note.edited`. Editing a note is dropped by the Timeline *and* by GENESIS.

### 4.4 The empty-table result is *absence of exercise*, not proven runtime failure

Phase B established, and this document accepts, that the instrumentation subsystem (commit `45f3b5a`, 2026-07-24) **postdates every row of real user data** (2026-06-29 → 2026-07-18). The `events` table holds one test fixture; `timeline_events` is empty.

**This is the most under-appreciated fact in the whole analysis.** The client→server RPC path, the persistence subscriber and the timeline subscriber have **never carried a single real user event**. They are marked UNTESTED above rather than WORKING, and the dual-run phase (§11 Phase 4) is not a verification formality — it is the first time this code will ever run in anger.

---

## 5. `TASK_COMPLETED` Contract Analysis

### 5.1 Why the duplicate exists

`src/contracts/events.ts` grew by appending capability blocks. The workspace block (lines 6-7) predates the Planning capability block (lines 76-77), which reused the same key names in a new namespace:

```
line  6:  TASK_CREATED:   "task.created"            ← shadowed
line  7:  TASK_COMPLETED: "task.completed"          ← shadowed
line 76:  TASK_CREATED:   "planning.task.created"   ← wins
line 77:  TASK_COMPLETED: "planning.task.completed" ← wins
```

In a JavaScript object literal the later key wins silently. TypeScript reports `TS1117` — 2 of the 9 `tsc` errors currently outstanding.

### 5.2 Which value wins — verified independently

Runtime probe of the compiled `Events` object (throwaway test, deleted after use):

```
TASK_CREATED                              = "planning.task.created"
TASK_COMPLETED                            = "planning.task.completed"
total keys                                = 93          (95 declarations)
duplicate VALUES                          = []
keys mapping to bare "task.created"/"task.completed" = []
```

**The strings the workspace actually publishes cannot be named through the registry at all.** This independently reproduces Phase B's finding.

### 5.3 Producers and consumers, by semantic meaning

| Role | Site | Uses | Effective value | Meaning |
| :--- | :--- | :--- | :--- | :--- |
| Producer | `akira-store.ts:249,364` | literal | `task.created` | workspace task |
| Producer | `akira-store.ts:270` | literal | `task.completed` | workspace task |
| Producer | `planning/services/TaskService.ts:44` | `Events.TASK_CREATED` | `planning.task.created` | GENESIS plan task |
| Producer | `planning/services/TaskService.ts:93` | `Events.TASK_COMPLETED` | `planning.task.completed` | GENESIS plan task |
| Consumer | `genesis/events/event-service.ts:121` | `case Events.TASK_COMPLETED` | matches planning only | **intends workspace** |
| Consumer | Timeline allowlist | literals | `task.created`, `task.completed` | workspace ✅ |
| Producer | `akira-os/timeline/service.ts:83,122` | `Events.TASK_*` | emits `planning.*` | rejected by allowlist |

**Two genuinely different domains collided on one key.** They are not synonyms — a workspace to-do and a GENESIS plan task are different entities — so the repair is disambiguation, not deduplication.

### 5.4 Smallest backward-compatible repair

**Rename the *planning* keys, not the workspace keys.**

```ts
// contracts/events.ts, lines 76-77
PLANNING_TASK_CREATED:   "planning.task.created",
PLANNING_TASK_COMPLETED: "planning.task.completed",
```

Then update the two `TaskService.ts` references. `TASK_CREATED` / `TASK_COMPLETED` revert to their workspace meanings, which is what `event-service.ts:121` and the Timeline allowlist already assume.

**Why this direction is the smallest and safest:**

| Criterion | Rename planning keys | Rename workspace keys |
| :--- | :--- | :--- |
| Emitted string values change | **none** | 2 (breaks the Timeline allowlist and the one persisted row) |
| Call sites touched | 2 | 3 publishers + allowlist + GENESIS switch + candidate rule |
| Fixes `TS1117` | ✅ | ✅ |
| Fixes S2 | ✅ | ❌ (moves the mismatch) |
| Persisted-data impact | none | rewrites `events.type` semantics |

**No string value on the wire changes.** This is a pure key rename: zero runtime behaviour change, `tsc` drops from 9 errors to 7, and S2 is closed. It is safe to land independently, before anything else.

### 5.5 Data dependency and the closing migration window

| Column | Rows today |
| :--- | ---: |
| `events.type` | 1 (`task.created`, `source: "tasks-test"`) |
| `timeline_events.event_type` | 0 |

`MemoryEvent.eventType` strings live only in `akira-store.state.memories`, which is RAM (§6.3). **No durable data depends on any event name today.** Once real events flow, `events.type` becomes an append-only historical record and every rename needs a data migration. **Contract repairs must land first.**

---

## 6. GENESIS Reality Connection Analysis

### 6.1 Per-arrow status

| # | Arrow | Status | Evidence |
| :-- | :--- | :--- | :--- |
| 1 | User Action → AKIRA OS state | **WORKING** | `akira-store.set()` → React |
| 2 | User Action → durable entity | **WORKING** | RPC → SQLite (un-awaited, unguarded) |
| 3 | AKIRA OS → `publish()` | **WORKING** | 26 sites, middleware validated |
| 4 | `publish()` → client bus | **DEAD END** | zero client subscribers by design |
| 5 | `publish()` → server RPC → server bus | **UNTESTED** | never carried real traffic (§4.4) |
| 6 | server bus → `events` table | **UNTESTED** | 1 test row only |
| 7 | server bus → `timeline_events` | **UNTESTED** | 0 rows |
| 8 | server bus → Analytics | **BROKEN** | subscriber never registered |
| 9 | **Canonical boundary → GENESIS** | **BROKEN (S1)** | no such edge exists |
| 10 | legacy bus → GENESIS `"*"` | **WORKING** | 1 type arrives |
| 11 | GENESIS switch → `MemoryEvent` | **BROKEN (S2, S3)** | constants mismatch |
| 12 | `record()` → candidate | **WORKING** | probe: 0 → 1 |
| 13 | candidate → validation → Memory | **WORKING** | probe: 0 → 1, outcome `Promote` |
| 14 | **Memory → Story** | **BROKEN (S4)** | `storyBuilder` not in module graph |
| 15 | **Memory → Importance** | **BROKEN (S4)** | `importanceBuilder` not in module graph |
| 16 | Memory → Understanding | **WORKING** | probe: 0 → 2 |
| 17 | Story → Understanding | **UNREACHABLE** | depends on 14 |
| 18 | Understanding → Insights | **WORKING** | `insight-engine` reachable |
| 19 | Memory → durable storage | **BROKEN** | RAM only; no `memories` table |
| 20 | Restart → memory reconstruction | **BROKEN** | reads `state.memories`, hard-coded `[]` at boot |

### 6.2 The cognitive engine works — proven

A throwaway probe (deleted immediately) fed **one** well-formed `task_completed` `MemoryEvent` through `eventService.record()` with no source modification:

```
BEFORE: {candidates:0, memories:0, stories:0, understandings:0}
AFTER : {candidates:1, memories:1, stories:0, understandings:2}

candidate: reason "Goal Progress", explanation 'Task finished: "Ship the recovery design".'
memory   : validator outcome Promote, explanation 'Goal progress candidate … promoted.'
```

A second probe recorded `presence_updated`: candidate count **unchanged**, confirming §4.2.

**Conclusion:** rules, validator, promotion and the understanding graph are all functional. Arrows 12, 13 and 16 are WORKING. The system is starved, not broken — **except** for arrows 14/15, which the same probe exposed.

### 6.3 S4 — the second severance, inside GENESIS *(new finding)*

`storyBuilder` subscribes memories into stories and self-initializes at module load:

```ts
// genesis/stories/story-builder.ts:94
storyBuilder.initialize();
```

That line only runs if the module is imported. The **only** importer of `story-builder.ts` is `src/genesis/stories/index.ts` — and **nothing imports that barrel.** `src/genesis/index.ts` deliberately exports `storyService` from `./stories/story-service`, bypassing it.

Verified by importing the production barrel exactly as `routes/brain.tsx` does:

```
import * as genesis from "@/genesis"      // production entry point
→ candidates: 1   memories: 1   stories: 0
→ "storyBuilder" in genesis === false
```

The Project Clustering Rule *would* have matched (the memory carried `relatedProjectId`). It never ran, because nothing subscribed it.

**The identical defect applies to `importance-builder`** (`genesis/importance/index.ts`, never imported). Reachability of every self-initializing module:

| Module | Self-inits | Reachable from `genesis/index.ts` |
| :--- | :--- | :--- |
| `candidate/candidate-service` | ✅ | ✅ |
| `events/event-service` | ✅ | ✅ |
| `understanding/engine` | ✅ | ✅ |
| `understanding/identity-builder` | ✅ | ✅ via `understanding/index.ts` |
| `insights/insight-engine` | ✅ | ✅ |
| `memory/relationships/relationship-service` | ✅ | ✅ |
| `context/context-builder` | ✅ | ✅ |
| `recall/recall-builder` | ✅ | ✅ direct import |
| **`stories/story-builder`** | ✅ | ❌ **orphaned** |
| **`importance/importance-builder`** | ✅ | ❌ **orphaned** |

**Consequence for the remediation:** Phase B's Phase 4 exit criterion — "completing a task produces a memory" — would pass while stories and importance stayed permanently empty, and `context-builder`, which reads `storyService.getStories()` for the AI prompt, would keep contributing nothing. The exit criterion must be raised to **story**, and S4 must be repaired in the same programme.

**Root cause class:** *initialization by import side effect*. A subscription's existence depends on whether some unrelated file happens to import its module. This is invisible to `tsc`, invisible to unit tests that import the module directly (which is why the existing tests pass), and invisible to review. §10.5 specifies the test class that makes it visible.

### 6.4 What GENESIS can currently remember

Its entire memory is its own bootstrap, its own reflection compilation, and six kinds of user correction to its own inferences — all eight mislabelled `note_created`. Not one project, task, note, mission or session. And none of it survives a restart (arrow 19/20).

---

## 7. Architecture Options

Evaluated against: existing adoption, persistence, ordering, error handling, type safety, GENESIS requirements, AKIRA OS requirements, module architecture, future TITAN/FORGE, backward compatibility.

### Option A — Unify on the instrumentation bus

GENESIS registers directly on `globalEventBus` and consumes `AkiraEvent`.

**For:** one mental model; one place to add a consumer; total ordering within the bus; the envelope, middleware, validation and store already exist there.

**Against:** couples GENESIS to the platform envelope and to every platform event type — the opposite of the `WorkspaceProvider` discipline that is AKIRA's best existing boundary. Because the bus has **no wildcard**, GENESIS must register a concrete subscriber and filter internally regardless, so an adapter appears anyway — just unnamed, inside GENESIS, and untested. GENESIS still needs `MemoryEvent` (title/description/relatedProjectId), so the translation survives with no clear home. Gives GENESIS no replay.

**Recursion risk: increased.** Every event type enters the documented `record → saveMemory → akira.set → presence → publish` loop.

### Option B — Platform bus + GENESIS Reality Adapter ✅

```
Application ──► instrumentation bus ──┬──► Timeline
                                      ├──► Analytics
                                      ├──► Event Store ◄── canonical truth
                                      │         │
                                      ▼         ▼ replay
                                   RealityAdapter
                            (allowlist · translate · dedupe)
                                      │
                                      ▼
                      MemoryEvent → candidate → memory → story → understanding
```

**For:** formalises what the code already reaches for — the `switch` in `event-service.ts:94-160` *is* this adapter, attached to the wrong bus. Keeps `MemoryEvent` as GENESIS's own vocabulary. One explicit, testable place for the allowlist, the translation and idempotency. Mirrors `WorkspaceProvider`, AKIRA's proven seam. The adapter consumes **both** live events and Event Store replay through one code path. Platform event types can be added without touching GENESIS — the property TITAN/FORGE will need.

**Against:** one more named component; two vocabularies persist. Both costs are real and both are justified: `AkiraEvent` and `MemoryEvent` model genuinely different things (a fact of the platform vs. an item of cognition).

**Recursion risk: containable** — the adapter is a natural choke point for a depth guard and the natural place to stop `saveMemory()` writing back into the store.

**Failure isolation: best** — an adapter fault cannot affect Timeline, Analytics or the Event Store.

### Option C — Keep both buses, add a reverse bridge

**Rejected.** Creates a cycle between two buses, with duplication and infinite-forwarding hazards on top of the recursion loop that git commit `67b89fd` proves has already happened once. Preserves two envelopes, two subscription models, two error philosophies. **This is the shape that produced the current defect.**

### Option D — Event-Store-first (GENESIS reads only the durable log)

**Right long-term shape, too large a step now.** Perfect replay symmetry and makes store/cognition divergence impossible by construction. But it needs a change feed and a durable cursor, neither of which exists, and it adds persistence-round-trip latency to cognition.

**Decisive point: Option B is a strict subset of Option D.** The adapter is precisely where the change feed later attaches. Choosing B now does not foreclose D.

### 7.1 Recommendation

**Option B**, for three reasons: it is the only option that both preserves GENESIS independence *and* provides replay; it names and tests a translation that already exists but is currently unnamed and untested; and it is a strict subset of the correct long-term architecture.

---

## 8. Recommended Remediation

### 8.1 Decisions

| Concern | Decision |
| :--- | :--- |
| **Event Source** | AKIRA OS services and `akira-store` remain the only producers. No producer is rewritten. |
| **Event Contract** | `contracts/events.ts` is the single legal way to name an event. Duplicate keys resolved per §5.4. All 26 literals replaced with `Events.*`. A contract test makes drift a build failure. |
| **Canonical Transport** | The instrumentation bus. The legacy bus is retired last, after its 15 producers move. |
| **Persistence** | The `events` table is the canonical record of reality. **Persistence is ordered before fan-out** and a failed write must not report success (closes PLT-007). |
| **Adapters** | Exactly one: `src/genesis/events/reality-adapter.ts`. Not named `EventAdapter` (§2.4). It is the only file that knows both vocabularies. |
| **GENESIS Consumption** | Adapter registers as `EventSubscriber {id: "genesis-reality-adapter"}`, filters by explicit allowlist, translates to `MemoryEvent`, calls `eventService.record()`. **`eventService`'s public API is unchanged**, so all 77 internal callers and every downstream service are untouched. |
| **Observability** | Timeline and Analytics stay bus subscribers, peers of the adapter. **Observability is never the domain event source** — GENESIS reads the same bus/store the observers read, not their output. |
| **Error Isolation** | Adapter failures are counted and inspectable, never `console.error`-and-continue. A GENESIS fault cannot break the platform: it is one subscriber among peers, each in its own `try/catch`. |
| **Duplicate Prevention** | Idempotency keyed on `AkiraEvent.id`, which the middleware guarantees and which `timeline_events` already relies on. Makes replay safe to re-run and shadow-mode safe to enable. |
| **Ordering** | Add a `rowid` tiebreaker to the 4 unordered Event Store queries (`latest()` already has one) and key the replay cursor on `(timestamp, rowid)`, not `timestamp + 1ms`. |
| **Loop Prevention** | Remove `saveMemory()`'s write into `akira-store` — it is a non-durable duplicate of the Event Store *and* one leg of the documented recursion loop. Add a bus depth guard as defence in depth. **Flow is strictly one-way: GENESIS never publishes to the platform bus.** |

### 8.2 The adapter, specified

```ts
// src/genesis/events/reality-adapter.ts
export interface RealityAdapterMetrics {
  received: number;
  translated: number;
  rejectedByAllowlist: number;
  suppressedAsDuplicate: number;
  failed: number;
  lastError: { eventId: string; message: string } | null;
}

export const realityAdapter = {
  id: "genesis-reality-adapter",
  onEvent(event: AkiraEvent): void { /* filter → dedupe → translate → record */ },
  getMetrics(): RealityAdapterMetrics,
  setMode(mode: "shadow" | "active"): void,   // shadow: count only, do not record
  reset(): void,                              // tests
};
```

Translation moves out of `event-service.ts:94-160` **unchanged** in Phase 3, so the cutover carries no behavioural delta. New event types are added to the allowlist only with a matching candidate rule or an explicit documented exclusion.

### 8.3 S4 repair

Two options; **prefer (a)**:

- **(a) Explicit registration.** Add `storyBuilder` and `importanceBuilder` to `src/genesis/index.ts`, and give GENESIS a single explicit `initializeGenesis()` entry point that registers every subscriber deliberately. Removes reliance on import side effects for the two orphans and creates the seam to remove it for the other eight later.
- **(b) Minimal.** Re-export the two barrels from `genesis/index.ts`. One line each, but preserves the fragile pattern.

Either way, §10.5's reachability test is **mandatory** — it is what stops this recurring.

---

## 9. Compatibility Analysis

| Surface | Impact |
| :--- | :--- |
| `eventService.record()` (77 callers) | **None.** Signature and semantics unchanged. |
| `candidateService`, `memoryService`, `validator`, `storyService`, `understandingEngine` | **None.** They consume `MemoryEvent`, which is unchanged. |
| 9 local GENESIS emitters | **None — keep them.** This mesh is the one part of the event architecture that works end to end (§3.1). Correctly scoped to intra-GENESIS coordination. |
| 26 publishers | Literal → `Events.*`. Same emitted strings. No behaviour change. |
| `Events.TASK_*` | Key rename only; **no wire value changes** (§5.4). |
| Timeline allowlist | Gains `note.updated` (or the rename lands); `note.edited` retired. |
| `events` / `timeline_events` rows | 1 test row, 0 rows. **No production data affected.** |
| GENESIS in-RAM memories | Lost on restart today; nothing to preserve. |
| SDK / module `EventAdapter` | Untouched (§2.4). |
| Legacy bus consumers (`companionStateService`, `contextResolutionService` ×2) | Must move with the presence producers in the final phase. |

**Backward-compatibility conclusion: no migration is required and no persisted data is at risk — provided the contract repairs land before real events start flowing.** That ordering is the whole compatibility story.

---

## 10. Test Strategy

The governing fact: **every subsystem test passes today while the system is disconnected.** Unit tests import modules directly, which both supplies the very import side effect that production lacks and bypasses the boundary entirely. The strategy must therefore be dominated by tests that cross boundaries and assert reachability.

### 10.1 Contract tests *(land first, with Phase 1)*

1. No duplicate keys in `Events` — `Object.keys().length === 95` declarations, asserted by parsing the source, not the compiled object (the compiled object is what hides the bug).
2. Every production `publish()` literal resolves to a value present in `Events`.
3. Every Timeline allowlist entry is published by some producer.
4. Every `case` in the adapter allowlist resolves to a published value.
5. `Events.TASK_COMPLETED === "task.completed"` — a direct regression pin on S2.

### 10.2 Producer tests

For each of the 26 types: perform the real store/service action against a test database and assert `publish` was called with the expected type, payload shape and `Events.*` constant. Catches S3-class name drift at the source.

### 10.3 Boundary tests

- Adapter unit tests over fixture `AkiraEvent`s for all 26 types: correct `MemoryEvent` translation; allowlist rejection; duplicate-`id` suppression; metrics counters.
- `publish()` → server → `events` row (the path that has never run — §4.4).
- Persistence failure must **not** report success (PLT-007).
- Ordering: 100 events inside one millisecond replay in publication order.

### 10.4 GENESIS integration tests

`User action → event → adapter → eventService.record()` with the real bus and a real subscriber registration — no direct module imports of the adapter.

### 10.5 Reachability tests — mandatory, and new

The test class that would have caught **S4**, and the only one that catches this defect category:

```ts
// Import ONLY the production entry point. Never import a builder directly.
const genesis = await import("@/genesis");

it("wires Memory -> Story through the production entry point", () => {
  eventService.record("task_completed", "T", "d", "proj-1", null, {});
  expect(genesis.storyService.getStories().length).toBeGreaterThan(0);
});
```

Plus an assertion that every module containing a top-level `*.initialize()` is reachable from `src/genesis/index.ts`, enumerated by static scan so a newly added orphan fails the build.

**Rule for this suite: it may import `@/genesis` and nothing else from GENESIS.** Any direct submodule import silently restores the missing side effect and voids the test.

### 10.6 End-to-end reality test

The acceptance test for the whole programme:

```
Create Project          → project.created  → memory
Add Task                → task.created
Complete Task           → task.completed   → candidate → memory → STORY
Assert:
  ✓ events table contains all three, in order
  ✓ timeline_events contains all three
  ✓ candidateService: ≥1 candidate, reason "Goal Progress"
  ✓ memoryService:    ≥1 memory,    outcome Promote
  ✓ storyService:     ≥1 story, "Project Arc:", linked to the project   ← S4 gate
  ✓ understandingEngine: ≥1 understanding
  ✓ no duplicate memory when the same AkiraEvent.id is delivered twice
  ✓ restart → replay from the Event Store → identical memory set        ← determinism
```

Run through the production entry point only. **The story assertion is the gate that Phase B's criterion would have missed.**

### 10.7 Negative and safety tests

Recursion depth bounded under a burst; GENESIS never publishes to the platform bus (assert zero platform publishes during a cognitive cycle); an adapter exception does not prevent Timeline or persistence; shadow mode records zero memories.

---

## 11. Proposed Implementation Phases

Each phase is independently verifiable, independently revertible, and leaves the system working.

**Phase 0 — Baseline.** Integrate the in-flight recovery streams; establish a clean commit; `tsc` = 9 known errors; record the test-count baseline. *Exit: stable HEAD, no uncommitted work.*

**Phase 1 — Contract repair (no behaviour change).** §5.4 key rename; update `TaskService.ts` ×2; reconcile `note.updated`/`note.edited`; declare the 4 undeclared types; replace all 26 literals with `Events.*`; add §10.1 contract tests. *Exit: `tsc` 9 → 7 errors; no emitted string changes; contract tests green in CI.*

**Phase 2 — S4 repair (independent of the bus).** Register `storyBuilder` and `importanceBuilder` per §8.3; add §10.5 reachability tests. *Exit: a `task_completed` fed directly to `eventService.record()` produces a **story** through the production entry point. Independently valuable and shippable alone.*

**Phase 3 — Adapter, dormant.** Create `reality-adapter.ts`, moving the translation unchanged; explicit allowlist; idempotency; metrics. Full unit coverage. **Do not register it.** *Exit: production behaviour byte-identical.*

**Phase 4 — Dual-run measurement.** Register the adapter in **shadow mode**; register the never-registered `AnalyticsSubscriber`; replace the per-request subscriber scan with explicit startup registration via the existing unused `EventService.start()`. Run the app normally and compare, per type: published vs `events` rows vs `timeline_events` rows vs adapter-translated. *Exit: published = persisted = translated for every allowlisted type across a real session; every discrepancy explained.*

> **This is the highest-risk phase and the one that must not be compressed.** It is the first time the client→server event path will ever carry real traffic (§4.4). Expect it to surface latent faults that no amount of static analysis can predict.

**Phase 5 — Cut over.** Adapter to active mode; remove the legacy `"*"` subscription; delete the `saveMemory() → state.memories` path; add Event Store replay on boot with the `(timestamp, rowid)` cursor and ordering tiebreaker; add candidate rules for newly visible types (`session.*`, `vault.*`) or document their exclusion; fix the "Project Completed" rule's `metadata.patch` expectation; split GENESIS's 8 self-recorded `note_created` events into their own internal type. *Exit: §10.6 passes in full, including replay determinism.*

**Phase 6 — Retire the legacy architecture.** Move the 3 presence publishers and 12 runtime publishers to `publish()`; drop the `presence.updated` bridge exclusion; delete `shared/infrastructure/event-bus/` (removing the `shared → instrumentation` upward edge); add the bus depth guard; **keep the 9 local emitters**. *Exit: one bus, one store, one adapter, no special cases.*

**Out of scope:** GENESIS v2.19+ features; the `diagnostics/` decision; prompt token budgeting — though that becomes urgent the moment Phase 5 lands, because memories will finally accumulate for the first time.

---

## 12. Risks and Stop Conditions

### 12.1 Risks

| # | Risk | Likelihood | Impact | Mitigation |
| :-- | :--- | :--- | :--- | :--- |
| R1 | Recursion loop reopens for every event type | Medium | High | Delete `saveMemory()`'s store write (Phase 5); depth guard (Phase 6); the loop's only current protection is float rounding |
| R2 | Phase 4 reveals the RPC path never worked | **Medium-high** | High | Phase 4 exists precisely to find this; it is measurement, not verification |
| R3 | Memory volume explodes once real events flow | High | Medium | 26 live types vs 0 today; token budgeting must be scheduled with Phase 5 |
| R4 | Contract rename lands after events start flowing | Low | High | Phase 1 gates everything; do not reorder |
| R5 | Another orphaned-subscriber defect exists elsewhere | Medium | Medium | §10.5 static reachability scan generalises beyond the two known cases |
| R6 | Adapter becomes a second god-object | Low | Medium | Metrics + allowlist only; no business logic; hard file-size review limit |
| R7 | Ordering inversions under load | Medium | Medium | `rowid` tiebreaker; ordering test at 100 events/ms |
| R8 | Parallel recovery streams collide in `contracts/events.ts` | **High** | Low | Phase 0 gate; `events.ts` is currently unmodified in git and must stay that way until Phase 1 |

### 12.2 Stop conditions — halt and escalate

1. **Phase 4 shows events published but not persisted.** The transport is broken in a way static analysis cannot see. Stop; fix transport before any cognitive cutover.
2. **Recursion appears in shadow mode.** Stop; the depth guard moves ahead of the cutover.
3. **A third event system is discovered carrying production traffic.** The census is wrong; re-run it before proceeding.
4. **Any phase requires changing `MemoryEvent` or a GENESIS service signature.** That contradicts "preserve stable GENESIS APIs" — escalate for an explicit decision.
5. **Real user events exist in `events` before Phase 1 lands.** The rename window has closed; a data migration is now required and must be designed first.
6. **Story formation still fails after Phase 2.** S4's root cause is deeper than module reachability; re-investigate before building on it.

### 12.3 Recommended immediate action

**Phases 1 and 2 are independent of each other and of the bus work, carry no behavioural risk, and each close a confirmed defect.** Phase 2 in particular is worth landing on its own merits: it is the difference between GENESIS forming narratives and never forming them, and it does not depend on a single decision about bus architecture.

---

## Appendix A — Verification performed for this document

| Claim | Method | Result |
| :--- | :--- | :--- |
| `TASK_COMPLETED` resolves to `planning.task.completed` | Runtime probe of compiled `Events` | Confirmed; 93 keys; no key maps to bare `task.*` |
| Cognitive pipeline works when fed | Probe: one `task_completed` through `record()` | 1 candidate, 1 memory, 2 understandings |
| `presence_updated` produces nothing | Same probe | Candidate count unchanged |
| **`Memory → Story` is dead in production** | Probe importing `@/genesis` only | 0 stories; `"storyBuilder" in genesis === false` |
| `stories/` and `importance/` barrels never imported | Static import-graph scan | No importers |
| Timeline allowlist = 22 entries | Direct read | Confirmed |
| 26 publish sites / 25 distinct types | Repository scan | Confirmed, matches Phase B |
| `events.ts` unmodified in git | `git status` | Confirmed — rename window still open |

All probes were throwaway test files, run against an in-memory database and **deleted immediately**. No source file was modified. `git status` for source is unchanged by this phase.

---

## Compliance

| Constraint | Status |
| :--- | :--- |
| Do not merge or delete an event bus | ✅ Not touched |
| Do not change GENESIS | ✅ Not touched |
| Do not change workspace producers | ✅ Not touched |
| Do not modify event contracts | ✅ `contracts/events.ts` unmodified |
| Do not add adapters | ✅ Specified only, not created |
| Do not fix tests by changing assertions | ✅ No test modified |
| Design only | ✅ Zero source modifications |
