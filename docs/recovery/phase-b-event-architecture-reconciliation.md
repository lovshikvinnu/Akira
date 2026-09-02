# Phase B — Event Architecture Reconciliation

**Type:** Investigation. **No source file was modified in this phase.**
**HEAD:** `b561730` (moved from `f2d8cf6` mid-session when the audit docs and the untracked `genesis/reasoning` + `genesis/decision` work were committed; this does not affect any Phase A measurement, which was taken against the working tree).

**Evidence sources:** full repository inspection; the runtime `Events` object probed in an isolated throwaway test (deleted immediately); Git history; and **read-only inspection of a copy of the live `%APPDATA%\AKIRA\akira.db`** (1.75 MB). The user's real database was copied, never opened for writing, and its mtime is unchanged. No API key value was printed at any point.

---

## 1. Executive Summary

AKIRA does not have one event system. It has **thirteen**, and the two that matter are not connected to each other.

Workspace reality — creating a project, completing a task, writing a note, starting a session — is published to the **instrumentation bus** (`src/instrumentation/event-bus.ts`), which persists to the SQLite `events` table and feeds the Timeline. GENESIS listens on a **different, older bus** (`src/shared/infrastructure/event-bus/index.ts`). The only bridge between them runs *from* the old bus *to* the new one — the opposite of the direction GENESIS needs — and it explicitly excludes the single event type that actually travels on the old bus.

The consequence, traced end to end: **of 25 real-world event types published in production, GENESIS can observe zero.** Its cognitive pipeline is fed entirely by 77 `eventService.record()` calls that GENESIS makes to itself, of which only 8 match a memory-candidate rule — and all 8 are GENESIS's own bootstrap and user-correction events, mislabelled as `note_created`.

Three independent faults each block the flow on their own, so fixing any one alone changes nothing:

1. **Wrong bus.** No workspace event is ever published on the bus GENESIS subscribes to.
2. **Wrong constant.** `Events.TASK_COMPLETED` resolves at runtime to `"planning.task.completed"`, not `"task.completed"` — verified by probe. So even on a unified bus, task completion would not match.
3. **Wrong name.** The store publishes `note.updated`; the registry, the Timeline allowlist and GENESIS all expect `note.edited`. Note edits are invisible to both consumers.

A fourth finding is the reason none of this was noticed: **the pipeline has never run against real usage.** The live database holds 3 projects, 7 tasks, 3 notes and 3 sessions created between 2026-06-29 and 2026-07-18 — and the `events` table contains exactly **one** row, a leftover test fixture (`source: "tasks-test"`), while `timeline_events` contains **zero**. The entire instrumentation subsystem was introduced on **2026-07-24**, after all of that data was created. The pipeline is not failing in production; it has never been exercised in production.

This phase makes **no change**. §9 recommends a reconciliation strategy and §10 a phased migration, for your decision.

---

## 2. Actual Event Architecture

### 2.1 What the architecture is supposed to be

```
AKIRA OS ──── Reality / Platform Events ────► GENESIS ──── Cognitive Context ────► AI Providers
```

### 2.2 What the code actually does

```
                        ┌──────────────────────────────────────────────┐
   USER ACTION          │  CLIENT (browser)                            │
   (create project,     │                                              │
    complete task, …)   │   akira-store.ts                             │
        │               │     ├── set() → in-memory state → React      │
        └───────────────┼───► ├── publish({type:"project.created"}) ──┐ │
                        │     └── import("../akira-os/x").then(svc =>  │ │
                        │            svc.add(...))  ── RPC ──► SQLite  │ │  (durable entity write,
                        │                                              │ │   36 sites, 0 .catch)
                        │   src/instrumentation/publisher.ts           │ │
                        │     publish()                                ◄─┘
                        │       ├─1─► middleware pipeline (id/ts/corrId,
                        │       │      serialization + schema validate)
                        │       ├─2─► client globalEventBus.publish()
                        │       │      └── subscribers on client: NONE
                        │       └─3─► persistPublishEventRpc({data})
                        └──────────────────┬───────────────────────────┘
                                           │ HTTP POST  _serverFn
                        ┌──────────────────▼───────────────────────────┐
                        │  SERVER                                      │
                        │   instrumentation/server/index.ts            │
                        │     • scans (globalEventBus as any).subscribers
                        │     • lazily registers PersistenceSubscriber
                        │     • lazily registers TimelineSubscriber
                        │     • re-runs the middleware pipeline
                        │     • globalEventBus.publish(processedEvent)  │
                        │            │                                 │
                        │            ├──► PersistenceSubscriber ──► events table
                        │            ├──► TimelineSubscriber ─────► timeline_events
                        │            │       (22-type allowlist)      │
                        │            └──► AnalyticsSubscriber          │
                        │                    ✗ NEVER REGISTERED        │
                        └──────────────────────────────────────────────┘

    ╔══════════════════════════════════════════════════════════════════╗
    ║   ✗  NO PATH FROM HERE TO GENESIS                                ║
    ╚══════════════════════════════════════════════════════════════════╝

                        ┌──────────────────────────────────────────────┐
                        │  LEGACY BUS  shared/infrastructure/event-bus │
                        │                                              │
   presenceService ─────┼─► eventBus.publish("presence.updated", …)    │
   (3 sites)            │        │                                     │
                        │        ├──► direct subscribers:              │
   runtime lifecycle ───┼─►      │      companionStateService          │
   + capabilityRegistry │        │      contextResolutionService (×2)   │
   (11 sites — never    │        │                                     │
    fire: no modules    │        ├──► "*" wildcard subscriber:         │
    are ever loaded)    │        │      genesis/events/event-service   │
                        │        │        └── switch: 8 cases          │
                        │        │            only presence.updated    │
                        │        │            can ever match           │
                        │        │                                     │
                        │        └─ async bridge ─► instrumentation    │
                        │             import(...).then(publish)        │
                        │             if (type !== "presence.updated")  │
                        │             .catch(() => {})   ← swallows all │
                        │             ▲                                │
                        │             └── ONE-WAY, and the one type on  │
                        │                 this bus is filtered out      │
                        └──────────────────────────────────────────────┘

                        ┌──────────────────────────────────────────────┐
                        │  GENESIS MemoryEvent STREAM                  │
                        │   genesis/events/event-service.ts            │
                        │                                              │
   77 × eventService ───┼─► record(eventType, title, desc, …)          │
   .record() — ALL      │        ├─1─► saveMemory(event)               │
   from inside GENESIS  │        │       └─► state.memories (RAM only) │
                        │        └─2─► callbacks → candidateService    │
                        │                  └─► 7 candidate rules       │
                        │                       match only 7 legacy    │
                        │                       eventType names        │
                        └──────────────────────────────────────────────┘

                        ┌──────────────────────────────────────────────┐
                        │  9 LOCAL EMITTERS (plain Set<Callback>)      │
                        │  presence · state · goals · habits ·          │
                        │  knowledge · relationships · reflection ──┐  │
                        │                                            ▼  │
                        │                            contextResolution   │
                        │                                     │          │
                        │                                     ▼          │
                        │                              initiative        │
                        │  Not persisted. Not on any bus. WORKS.        │
                        └──────────────────────────────────────────────┘
```

### 2.3 The three severance points

```
 (1) WRONG BUS
     akira-store ──publish()──► instrumentation bus
     GENESIS      ──subscribe("*")──► legacy bus
     bridge:      legacy ──► instrumentation   (one-way, wrong direction)

 (2) WRONG CONSTANT                       declared twice, later wins
     Events.TASK_COMPLETED  ──runtime──►  "planning.task.completed"
     store publishes                       "task.completed"        ✗ no match

 (3) WRONG NAME
     store publishes                       "note.updated"
     registry / timeline / GENESIS expect  "note.edited"           ✗ no match
```

---

## 3. Event System Inventory

Thirteen distinct mechanisms. Test-only publishers are excluded from the counts.

### 3.1 Legacy Event Bus

| | |
| :--- | :--- |
| **Name** | `SimpleEventBus` (exported as `eventBus`) |
| **Location** | `src/shared/infrastructure/event-bus/index.ts` |
| **Responsibility** | String-topic pub/sub with a `"*"` wildcard channel |
| **Publishers** | **15 production**: `presence/service.ts` ×3 (`presence.updated`); `runtime/lifecycle/lifecycle-manager.ts` ×8; `runtime/registry/capability-registry.ts` ×3; `runtime/runtime-manager.ts` ×1 (module-context passthrough). The 12 runtime sites **never fire** — no module is ever loaded (audit BND-007). |
| **Subscribers** | 4 production: `genesis/events/event-service.ts` (`"*"`), `genesis/context/state/service.ts`, `genesis/context/context-resolution/service.ts` ×2 |
| **Event types carried in practice** | **`presence.updated` only** |
| **Persistence** | None |
| **Sync/Async** | Synchronous delivery; the instrumentation bridge inside `publish()` is async |
| **Error handling** | Per-subscriber `try/catch` → `console.error`. Publisher gets no signal. |
| **Dependencies** | → `src/instrumentation` (upward edge from `shared/`; audit BND-006) |

### 3.2 Instrumentation Event Bus

| | |
| :--- | :--- |
| **Name** | `EventBus` (singleton `globalEventBus`) |
| **Location** | `src/instrumentation/event-bus.ts` |
| **Responsibility** | Typed `AkiraEvent` delivery to `EventSubscriber` objects |
| **Publishers** | 1 direct (`Publisher.publish`), reached from **25 production `publish()` literals** — see §3.3 |
| **Subscribers** | 3 classes implement `EventSubscriber`; **2 registered** (`PersistenceSubscriber`, `TimelineSubscriber`), **1 never registered** (`AnalyticsSubscriber`) |
| **Event types** | 25 production literals |
| **Persistence** | Indirect, via `PersistenceSubscriber` |
| **Sync/Async** | `publish()` is synchronous; async subscriber results are fire-and-forget with `.catch(console.error)` |
| **Error handling** | Per-subscriber `try/catch` → `console.error`. **A failed persistence write returns success to the caller** (audit PLT-007). |
| **Dependencies** | → `middleware`, `event-types`; server path → `persistence/connection` |

### 3.3 Publisher / client-server split

| | |
| :--- | :--- |
| **Location** | `src/instrumentation/publisher.ts`, `src/instrumentation/server/index.ts` |
| **Responsibility** | Run the middleware pipeline, publish locally, forward to the server RPC for persistence |
| **Production publishers** | `persistence/akira-store.ts` **17**; `akira-os/vault/VaultStorageService.ts` **5**; `akira-os/vault/VaultFolderService.ts` **3**; `akira-os/search/services/index.ts` **1** = **26 call sites / 25 distinct types** |
| **Notable** | **Every one uses a string literal. `grep -c "Events\." src/persistence/akira-store.ts` → 0** — the `Events` registry is imported and never used. |
| **Error handling** | Client: `.catch(err => console.error(...))` on the RPC, plus a `.catch(() => {})` on the fallback dynamic import |

### 3.4 Event Store

| | |
| :--- | :--- |
| **Location** | `src/instrumentation/event-store/` (`sqlite-event-repository.ts`, `schema.ts`, `migration.ts`, `persistence-subscriber.ts`, `event-service.ts`) |
| **Responsibility** | Durable append-only log of `AkiraEvent` |
| **Schema** | `events(id PK, type, source, timestamp INTEGER, version INTEGER, entity_id, actor, correlation_id, payload_json, metadata_json)` + 5 indexes |
| **Read API** | `findById`, `findByType`, `findBySource`, `findByCorrelationId`, `findBetween`, `latest(limit)` |
| **Replay capability** | `findBetween(start, end)` — **exists and is used** by `RebuildManager` and `ConsistencyChecker`. This is the only replay primitive in AKIRA. |
| **Ordering** | Only `latest()` has a tiebreaker (`timestamp DESC, rowid DESC`). The other four order by `timestamp` alone — millisecond resolution, and the repo's own benchmark measures 12,166–22,598 events/sec (audit PLT-006). |
| **Live contents** | **1 row** — see §4.6 |
| **Lifecycle wiring** | `EventService.start()` exists to register the persistence subscriber and is **never called in production**; registration happens instead via a per-request scan inside the RPC (audit PLT-013). |

### 3.5 Middleware pipeline

| | |
| :--- | :--- |
| **Location** | `src/instrumentation/middleware/index.ts` |
| **Chain** | `eventIdGenerator → timestampInjector → correlationIdGenerator → serializationValidator → validator` |
| **Behaviour** | Guarded by `if (!event.x)`, so re-running is idempotent for id/timestamp/correlationId — which matters because the pipeline runs **twice**, once on the client and again on the server |
| **Risk** | `serializationValidator` **throws** on any `undefined` nested value, `Map`, `Set`, `NaN`, or class instance. On the client it throws *inside* `akira-store.set()`'s updater (audit REL-006). `correlationIdGenerator` mints a fresh id per event, so `findByCorrelationId` returns exactly one row by construction (audit PLT-011). |

### 3.6 Timeline Subscriber

| | |
| :--- | :--- |
| **Location** | `src/instrumentation/subscribers/timeline-subscriber.ts` |
| **Filter** | Hard-coded 22-type allowlist |
| **Writes** | `timeline_events`, reusing `AkiraEvent.id` as the primary key (accidental idempotency) |
| **Registration** | Server RPC scan (§3.3), and `akira-os/timeline/service.ts:36` — but that path is a **no-op in the browser** and has no server-side production caller |
| **Error handling** | Re-throws; caught by the bus and logged |
| **Contract drift** | 4 published types are not in the allowlist; 1 allowlist entry is never published — §6.4 |

### 3.7 GENESIS MemoryEvent stream

| | |
| :--- | :--- |
| **Location** | `src/genesis/events/event-service.ts` |
| **Responsibility** | GENESIS's own event vocabulary (`MemoryEvent`), and the **only** intake for the cognitive pipeline |
| **Publishers** | **77 `eventService.record()` call sites, every one inside `src/genesis/`** — identity/services 13 files, planning/services 10, plus context/{goals,habits,initiative,knowledge,relationships,state} and insights/reflection |
| **Second input** | The legacy-bus `"*"` subscription, translating 8 `Events.*` cases into legacy `eventType` names |
| **Subscribers** | `candidateService` (via `onRecord`) |
| **Persistence** | `saveMemory(event)` → `akira-store.state.memories` — **RAM only.** There is no `memories` table (confirmed against the live DB, §4.6) |
| **Error handling** | Persist failure → `console.error`, then **publishes anyway** — in-process state diverges from the durable record (audit REL-005) |
| **Init** | `eventService.initialize()` at module scope (`event-service.ts:166`) — an import-time side effect (audit BND-004) |

### 3.8 Candidate rule engine

| | |
| :--- | :--- |
| **Location** | `src/genesis/candidate/candidate-rules.ts` |
| **Responsibility** | Decide which `MemoryEvent`s become memory candidates |
| **Matches** | Exactly 7 legacy names: `project_created`, `project_updated` (only with `metadata.patch.progress === 100`), `project_continued`, `mission_completed`, `task_completed`, `note_created`, `note_edited` |
| **Critical** | **`presence_updated` matches no rule.** The one event type that reaches GENESIS from the platform produces nothing. |
| **Extensibility** | `registerRule()` is exported — and has **zero call sites** |

### 3.9 – 3.13 Nine local subsystem emitters

| Location | Emitter | Consumers |
| :--- | :--- | :--- |
| `akira-os/presence/events.ts` | `presenceEvents` | (none in production) |
| `genesis/context/state/events.ts` | `stateEvents` | `contextResolutionService` |
| `genesis/context/goals/events.ts` | `goalEvents` | `contextResolutionService` |
| `genesis/context/habits/events.ts` | `habitEvents` | `contextResolutionService` |
| `genesis/context/knowledge/events.ts` | `knowledgeEvents` | `contextResolutionService` |
| `genesis/context/relationships/events.ts` | `relationshipEvents` | `contextResolutionService` |
| `genesis/insights/reflection/events.ts` | `reflectionEvents` | `contextResolutionService` |
| `genesis/context/context-resolution/events.ts` | `contextResolutionEvents` | `initiativeService` |
| `genesis/context/initiative/events.ts` | `initiativeEvents` | (none in production) |

Each is an independent `Set<Callback>` with its own `publish`/`subscribe`, `try/catch` → `console.error`, no persistence, no bus connection. **Verified: none of them imports `eventBus` or `instrumentation`.**

**This mesh is the one part of the event architecture that works end to end.** Six engines fan into `contextResolutionService`, which fans into `initiativeService`. It is well-factored and should be preserved — its only defect is that its ultimate input is starved.

### 3.14 Runtime + Observability event constants

| Location | Status |
| :--- | :--- |
| `runtime/lifecycle/lifecycle-events.ts` (7 constants), `runtime/registry/capability-events.ts` (4) | Published on the legacy bus; **never fire** — no module is ever loaded |
| `observability/events/index.ts` | Body is `export {};` with a comment: *"Detailed implementations … will be introduced in subsequent stabilization sprints"* |

---

## 4. Reality Event Traces

Each trace follows: **User action → service → state change → publication → bus → subscribers → store → GENESIS**, and records precisely where it stops.

### 4.1 Project Created

```
UI → akira.addProject()                                      persistence/akira-store.ts:113
  ├─ publish({type:"project.created", source:"projects-store",
  │           payload:{id,name,tag}, version:1})                                      :119
  ├─ set() → state.projects                                                           :127
  └─ import("../akira-os/projects").then(svc => svc.add(p))   ── RPC ──► projects table
                                                                (un-awaited, no .catch)
publish() → middleware ✓ → client globalEventBus (0 subscribers)
         → persistPublishEventRpc ──► server bus
              ├─► PersistenceSubscriber  ──► events table          ✓ reaches here
              ├─► TimelineSubscriber (allowlisted) ──► timeline_events  ✓
              └─► AnalyticsSubscriber                              ✗ never registered

GENESIS: ✗ STOPS at the server bus. GENESIS subscribes to the legacy bus, which
         never receives project.created. Its Events.PROJECT_CREATED case is unreachable.
```
**Stops at:** the instrumentation bus. Never enters GENESIS.

### 4.2 Project Updated
Identical, `akira-store.ts:147`. Note the candidate rule for this type additionally requires `metadata.patch.progress === 100`, but the published payload is `{id, name, patch}` with no `metadata` key at all — so even on a unified bus this rule could not fire without a payload change.
**Stops at:** the instrumentation bus.

### 4.3 Task Created
`akira-store.ts:249` and `:364` publish `"task.created"`. Reaches the Event Store and the Timeline.
**Stops at:** the instrumentation bus. **Double blocker:** `Events.TASK_CREATED` resolves to `"planning.task.created"`, so the registry cannot even name this event (§6.2).

### 4.4 Task Completed
```
UI → akira.toggleTask(id) → t.done === true                   akira-store.ts:260
  └─ publish({type:"task.completed", payload:{id,title,projectId}})                   :270
       (and if every task is done → publish("mission.completed"))                     :279
→ events table ✓   → timeline_events ✓   → GENESIS ✗

GENESIS's handler:  case Events.TASK_COMPLETED:  →  "planning.task.completed"
                    published value:                "task.completed"
                    ⇒ no match, on any bus
```
**Stops at:** the instrumentation bus — and would still stop at the `switch` after a bus merge. This is the single most important user action in the product.

### 4.5 Note Created / Note Updated

```
addNote  → publish({type:"note.created"})                     akira-store.ts:441
updateNote → publish({type:"note.updated"})                                          :469
```
- `note.created` → events ✓, timeline ✓ (allowlisted), GENESIS ✗ (wrong bus)
- `note.updated` → events ✓, **timeline ✗** (allowlist has `note.edited`, not `note.updated`), GENESIS ✗ (wrong bus **and** wrong name)

**`note.edited` appears in the `Events` registry, in the Timeline allowlist, in GENESIS's `switch`, and in a candidate rule — and is published by nothing.** Editing a note is invisible to every consumer in the system.

### 4.6 Session Started / Session Ended
`akira-store.ts:639` / `:690`. Both allowlisted by the Timeline; both in the registry. Reach events + timeline.
**Stops at:** the instrumentation bus. GENESIS has no `SESSION_*` case and no candidate rule, so sessions are outside the cognitive model entirely — by design or by omission, this is undocumented.

### 4.7 Workspace State Changed

This is the one flow that **does** reach GENESIS, and it does so without touching either bus:

```
any akira.set()  →  emit()  →  listeners
   ├─► React (useSyncExternalStore)
   ├─► presenceService store subscriber                akira-os/presence/service.ts:32
   │     └─ rebuild PresenceContext
   │        └─ if (isContextChanged)            ← the recursion breaker, see §7.3
   │             ├─ presenceEvents.publish(ctx)        (local emitter)
   │             └─ eventBus.publish("presence.updated", {context})   ← LEGACY BUS
   │                  ├─► companionStateService (caches latestPresenceContext)
   │                  ├─► contextResolutionService ×2 → rebuildResolvedContext()
   │                  ├─► genesis eventService "*" ──► record("presence_updated", …)
   │                  │      ├─ saveMemory → state.memories (RAM)
   │                  │      └─ candidateService.evaluateEvent()
   │                  │           └─ ✗ NO candidate rule matches "presence_updated"
   │                  └─► instrumentation bridge: EXCLUDED by
   │                        `if (eventType !== "presence.updated")`
   └─► goalService / knowledgeService / habitService / relationshipService
         store subscribers → their own local emitters
```
**Stops at:** `candidateService`, with no candidate produced. And it never reaches the Event Store, because the bridge filters it out — so `presence.updated` is the one event type that is **never persisted anywhere**.

### 4.8 Empirical check against the live database

Read-only inspection of a copy of `%APPDATA%\AKIRA\akira.db`:

| Table | Rows |
| :--- | ---: |
| `projects` | 3 |
| `tasks` | 7 |
| `notes` | 3 |
| `sessions` | 3 |
| `settings` | 9 |
| **`events`** | **1** |
| **`timeline_events`** | **0** |
| `analytics_state` | 0 |
| `daily_metrics` / `project_metrics` | 1 / 1 |
| `vault_files`, `search_history` | 0 |
| a `memories` table | **does not exist** |

The single `events` row:
```json
{ "id": "evt-async-1", "type": "task.created", "source": "tasks-test",
  "timestamp": 1784475000000, "correlation_id": null,
  "payload_json": "{\"id\":\"task-201\",\"title\":\"Async Task\",\"projectId\":\"proj-async\"}" }
```
`source: "tasks-test"` and the hard-coded id identify this as a **test fixture written into the real user database** — not a user action.

**Why the tables are empty — and the honest conclusion.** Real entity creation spans **2026-06-29 → 2026-07-18**. Git shows the entire instrumentation subsystem *and* `akira-store`'s `publish()` calls were introduced in commit `45f3b5a` on **2026-07-24**:

```
$ git log --diff-filter=A --pretty="%h %ad %s" --date=short -- 'src/instrumentation/**' | tail -1
45f3b5a 2026-07-24 release(genesis): v2.19.0 Identity Capability

$ git log --pretty="%h %ad" --date=short -S 'from "../instrumentation"' -- src/persistence/akira-store.ts
45f3b5a 2026-07-24
```

So this is **not** evidence that the pipeline fails at runtime. It is evidence that **the pipeline has never been exercised against real usage** — it postdates every row of real data, and no session has produced a single genuine event since. That distinction matters for §10: the dual-run phase is not optional verification, it is the *first* time this path will ever carry real traffic.

**Incidental finding (outside Phase B scope, worth recording):** `fts_workspace` contains 1 `project` and 1 `task` row, against 3 projects and 7 tasks in the tables. The universal search index is missing ~80% of the workspace — consistent with the rows having been inserted by `executeMigration` before the FTS triggers existed, and with `initializer.ts`'s `if (!tableExists)` guards never re-running (audit PLT-003 / DAT-007).

---

## 5. GENESIS Visibility

> **Which real-world events can GENESIS currently observe?**

## **None.**

GENESIS's cognitive pipeline has exactly two inputs, and neither delivers workspace reality.

### Input 1 — the legacy-bus wildcard subscription

`genesis/events/event-service.ts:94` subscribes `"*"`. Its `switch` has 8 cases. Resolved against what is actually published:

| `switch` case | Runtime value | Published in production? | On the legacy bus? | Reaches GENESIS? |
| :--- | :--- | :--- | :--- | :--- |
| `Events.PROJECT_CREATED` | `project.created` | Yes | **No** | ✗ |
| `Events.PROJECT_UPDATED` | `project.updated` | Yes | **No** | ✗ |
| `Events.PROJECT_CONTINUED` | `project.continued` | Yes | **No** | ✗ |
| `Events.TASK_COMPLETED` | **`planning.task.completed`** | **No** | No | ✗ |
| `Events.MISSION_COMPLETED` | `mission.completed` | Yes | **No** | ✗ |
| `Events.NOTE_CREATED` | `note.created` | Yes | **No** | ✗ |
| `Events.NOTE_EDITED` | **`note.edited`** | **No** | No | ✗ |
| `Events.PRESENCE_UPDATED` | `presence.updated` | (legacy only) | **Yes** | **✓** |

One case is reachable. It maps to `MemoryEvent.eventType = "presence_updated"` — for which **no candidate rule exists**. So it produces no candidate, no memory, no story, no understanding, no insight.

### Input 2 — GENESIS recording to itself

77 `eventService.record()` sites, all inside `src/genesis/`. Of the 7 `eventType` values the candidate rules match, only `note_created` is ever passed as a literal — at exactly **8 sites**:

| Site | Title recorded | Reason |
| :--- | :--- | :--- |
| `context/state/service.ts:60` | `"Companion State Bootstrapped"` | every boot — and **twice**, from `__root.tsx:248` and `chat.tsx:596` |
| `context/state/service.ts:107` | `"Companion State Corrected"` | user correction |
| `context/goals/service.ts:167` | `"Goal Corrected"` | user correction |
| `context/habits/service.ts:132` | `"Habit Context Corrected"` | user correction |
| `context/knowledge/service.ts:153` | `"Knowledge Context Corrected"` | user correction |
| `context/relationships/service.ts:143` | `"Relationship Context Corrected"` | user correction |
| `insights/reflection/service.ts:64` | `"Reflection Context Compiled"` | reflection run |
| `insights/reflection/service.ts:108` | `"Reflection Context Corrected"` | user correction |

The remaining ~69 sites pass namespaced `Events.*` values (`planning.plan.created`, `identity.goal.updated`, …). **No candidate rule matches any namespaced value**, so none becomes a memory.

### Conclusion

**The complete set of things GENESIS can currently remember is: its own bootstrap, its own reflection compilation, and six kinds of user correction to its own inferences — all eight mislabelled as `note_created`.**

The audit's prediction is confirmed by static trace: after normal workspace use, `memoryService.getMemories()` can only contain entries titled `"Companion State Bootstrapped"`, `"…Corrected"`, or `"Reflection Context Compiled"`. Not one project, task, note, mission or session.

`registerRule()` — the extension point that would let GENESIS accept new event types — has zero call sites.

---

## 6. Event Contract Problems

### 6.1 Duplicate constant keys — verified at runtime

```
src/contracts/events.ts:
   line  6:  TASK_CREATED:   "task.created"            ← shadowed
   line  7:  TASK_COMPLETED: "task.completed"          ← shadowed
   line 76:  TASK_CREATED:   "planning.task.created"   ← wins
   line 77:  TASK_COMPLETED: "planning.task.completed" ← wins
```
`tsc`: `events.ts(76,3)` and `(77,3)` → `TS1117`. These are 2 of the 9 errors deliberately left by Phase A, because Step B4 says not to rename during this phase.

**Runtime probe** (isolated test, deleted after use):
```
TASK_CREATED   = "planning.task.created"
TASK_COMPLETED = "planning.task.completed"
total keys     = 93                  (95 declarations → 93 keys)
duplicate VALUES = []
is "task.created" reachable via any key?   = NO
is "task.completed" reachable via any key? = NO
```

**The strings `"task.created"` and `"task.completed"` cannot be named through the `Events` registry at all** — yet they are the values `akira-store` actually publishes, and the values the Timeline allowlist actually contains.

### 6.2 Every publisher and consumer of the collided names

| Role | Location | Uses | Effective value |
| :--- | :--- | :--- | :--- |
| Publisher | `akira-store.ts:249`, `:364` | literal | `"task.created"` |
| Publisher | `akira-store.ts:270` | literal | `"task.completed"` |
| Publisher | `planning/services/TaskService.ts:44` | `Events.TASK_CREATED` | `"planning.task.created"` |
| Publisher | `planning/services/TaskService.ts:93` | `Events.TASK_COMPLETED` | `"planning.task.completed"` |
| Consumer | `genesis/events/event-service.ts:121` | `case Events.TASK_COMPLETED` | matches `planning.*` only ⇒ **never matches the store** |
| Consumer | `TimelineSubscriber` allowlist | literals | `"task.created"`, `"task.completed"` ⇒ matches the store ✓ |
| Producer | `akira-os/timeline/service.ts:83`, `:122` | `Events.TASK_*` | emits `planning.*`, which the allowlist **rejects** (dev-seed path) |

Two domains — workspace tasks and planning tasks — share one constant name, and the workspace meaning is unreachable.

### 6.3 Does persisted data depend on the event strings?

**Yes, in two columns** — this constrains any rename:

| Column | Type | Live contents |
| :--- | :--- | :--- |
| `events.type` | TEXT | 1 row: `"task.created"` (test fixture) |
| `timeline_events.event_type` | TEXT | 0 rows |

Also indexed: `idx_events_type ON events(type)`.

**Practical conclusion:** the live database contains **no production event rows**, so a rename today would orphan exactly one test fixture. **The migration window is open now and will close the moment real events start flowing** — which is a strong argument for fixing the contract *before* connecting the buses, not after.

Note also that `MemoryEvent.eventType` is typed `legacy union | DomainEventName`, and GENESIS writes those strings into `state.memories` — but that array is never persisted (§4.8), so no durable GENESIS data depends on them.

### 6.4 Orphans — declared but never published (72 of 93)

Computed by reconciling the registry against all 25 production `publish()` literals:

| Group | Count | Examples |
| :--- | ---: | :--- |
| Identity events | 41 | `identity.node.created`, `identity.goal.updated`, `identity.confidence.calculated`, … |
| Planning events | 29 | `planning.plan.created`, `planning.task.completed`, `planning.health_rule.matched`, … |
| Workspace | 1 | **`note.edited`** |
| Platform | 1 | **`presence.updated`** |

The 70 identity/planning entries are not truly dead — they are passed to `eventService.record()` as `MemoryEvent.eventType` values (69 sites). But they are **never published on any bus and never persisted**, so they exist only as in-RAM labels. `presence.updated` is published on the legacy bus and is the one value deliberately excluded from persistence.

### 6.5 Published but not declared (6)

| Value | In registry? | Consequence |
| :--- | :--- | :--- |
| `task.created` | ✗ (shadowed) | §6.1 |
| `task.completed` | ✗ (shadowed) | §6.1 |
| `note.updated` | ✗ (registry has `note.edited`) | Dropped by the Timeline; invisible to GENESIS |
| `task.reopened` | ✗ | Dropped by the Timeline |
| `settings.updated` | ✗ | Dropped by the Timeline |
| `search.executed` | ✗ | Dropped by the Timeline; **is** counted by the analytics consistency checker, which looks for `search.executed`/`search.query`/`search.performed` |

### 6.6 Consumed but never published (1)

`note.edited` — present in the registry, the Timeline allowlist, GENESIS's `switch`, and a candidate rule. Published by nothing. **Editing a note produces `note.updated`, which no consumer accepts.**

### 6.7 Timeline allowlist reconciliation

| | Types |
| :--- | :--- |
| Published **and** allowlisted (reach the Timeline) | `project.created/updated/continued/deleted`, `task.created/completed/updated/deleted`, `mission.completed`, `note.created/deleted`, `session.started/ended`, `vault.file.uploaded/renamed/moved/deleted/restored`, `vault.folder.created/deleted/moved` — **21** |
| Published, **not** allowlisted (silently dropped) | `note.updated`, `task.reopened`, `settings.updated`, `search.executed` — **4** |
| Allowlisted, never published (dead entry) | `note.edited` — **1** |

### 6.8 Payload incompatibilities

| Consumer expectation | What is published | Effect |
| :--- | :--- | :--- |
| Candidate rule "Project Completed" reads `event.metadata.patch.progress === 100` | `project.updated` payload is `{id, name, patch}`; `metadata` is unset | Rule can never fire, even after a bus merge |
| `TimelineSubscriber` project-id extraction expects `payload.projectId` \| `payload.relatedProjectId` \| `payload.id` **with** `payload.color` or `payload.icon` | `project.created` payload is `{id, name, tag}` — no `color`/`icon` | `projectId` falls back to `event.entityId`, which no publisher sets ⇒ **project timeline rows get `project_id = NULL`** |
| `MemoryEvent` needs `title`, `description`, `relatedProjectId`, `relatedNoteId` | `AkiraEvent` has none of these | The `switch` in `event-service.ts` synthesises them — this is already an adapter (see §9) |
| `serializationValidator` rejects nested `undefined` | store payloads use `null` (e.g. `projectId: t.projectId` where the field is `string \| null`) | Safe today, unenforced by anything |
| `version` accepted as `string \| number`; column is `INTEGER` | all publishers send `1` | Safe today; `"1.2"` would silently truncate to `1` |

### 6.9 Bus-model incompatibility

| | Legacy bus | Instrumentation bus |
| :--- | :--- | :--- |
| Subscribe by | topic string, or `"*"` | subscriber **object** (`{id, onEvent}`) — **no wildcard** |
| Payload | raw `payload` | `AkiraEvent` envelope (id, type, source, timestamp, version, correlationId, …) |
| Identity | none | `id` required and validated |
| Persistence | none | via subscriber |

**This is the single most important constraint on any merge:** the instrumentation bus has **no wildcard channel**. GENESIS's `subscribe("*")` has no equivalent. A merge therefore requires GENESIS to register a concrete `EventSubscriber` and filter internally — which is precisely what the adapter in §9 does.

---

## 7. Bridge Risks

There is exactly one bridge in the system.

### 7.1 Anatomy

```
        LEGACY BUS                                      INSTRUMENTATION BUS
   eventBus.publish(type, payload)
        │
        ├─ (1) sync: notify topic subscribers
        ├─ (2) sync: notify "*" subscribers
        └─ (3) ASYNC, fire-and-forget:
              import("../../../instrumentation")
                .then(({publish}) => {
                   if (eventType !== "presence.updated")  ──────────► publish({...})
                 })
                .catch(() => {});          ← every failure discarded
```
`src/shared/infrastructure/event-bus/index.ts:64-80`

| Property | Value |
| :--- | :--- |
| **Direction** | legacy → instrumentation, **one-way** |
| **Filtering** | one hard-coded exclusion: `presence.updated` |
| **Excluded types** | `presence.updated` — which is *the only type ever published on the legacy bus in production* |
| **Sync model** | asynchronous (dynamic `import().then()`) |
| **Error handling** | `.catch(() => {})` plus an outer `try/catch { /* ignore */ }` — **two layers of total suppression** |
| **Retry** | none |
| **Source fidelity** | `deriveSourceFromEventType()` invents `projects-legacy-bus`, `tasks-legacy-bus`, … — provenance in the Event Store is synthetic |
| **Payload fidelity** | `payload: payload || {}`; `version: 1` hard-coded; no `entityId`, no `actor` |

### 7.2 Risk assessment

| Risk | Assessment |
| :--- | :--- |
| **Event loss** | **Certain and undetectable.** A rejected import or a `publish()` throw (e.g. `serializationValidator` on a nested `undefined`) is discarded by `.catch(() => {})`. No counter, no log, no metric. |
| **Ordering** | **Not preserved.** The forward is a microtask, so an event bridged from the legacy bus can be persisted *after* a later event published directly on the instrumentation bus. This compounds PLT-006 (no ordering tiebreaker) and PLT-015 (rebuild watermark skipping same-ms events). |
| **Duplication** | **Low today.** The bridge is the only forwarder and nothing publishes the same logical event to both buses. Would become a real risk if a merge added a reverse bridge — the reason §9 recommends against one. |
| **Recursion** | **Real, historically observed, and currently prevented only by a value guard** — see §7.3. |
| **Back-pressure** | None. Every legacy publish schedules a microtask; a burst schedules an unbounded number. |
| **Solves the actual problem?** | **No.** The bridge moves events *toward* persistence. GENESIS needs them moving *toward the cognitive layer*. It is orthogonal to the severance. |

### 7.3 The recursion risk is not theoretical — Git proves it happened

Commit **`67b89fd` (2026-07-17)**: *"Eliminate Presence/EventBus infinite recursion loop during store updates"*.

The diff to `src/akira-os/presence/service.ts` shows the loop and its fix:

```diff
     this.storeUnsubscribe = akira.subscribe(() => {
       if (this.currentContext) {
         const freshContext = buildPresenceContext(this.resolveInputsFromStore());
-        this.currentContext = freshContext;
-        presenceEvents.publish(freshContext);
+        if (this.isContextChanged(this.currentContext, freshContext)) {
+          this.currentContext = freshContext;
+          presenceEvents.publish(freshContext);
+          eventBus.publish(Events.PRESENCE_UPDATED, { context: freshContext });
+        }
       }
     });
+
+  private isContextChanged(prev, next): boolean {
+    return prev.sessionType !== next.sessionType || … ||
+           prev.continuityConfidence !== next.continuityConfidence ||
+           prev.presenceConfidence !== next.presenceConfidence;
+  }
```

The loop:
```
akira.set() → emit() → presence store subscriber → rebuild PresenceContext
   → eventBus.publish("presence.updated")
   → genesis eventService "*" → record("presence_updated") → saveMemory()
   → akira.set()  ⟲
```

**What actually stops it** is that `calculatePresenceConfidence` / `calculateContinuityConfidence` round to 2 decimals (`presence/rules.ts:88-109`) and `isContextChanged` compares those rounded values. When a memory is recorded, `lastEventTime` jumps to ~now, so `idleTime → 0` and `presenceConfidence → 1.0`; the next comparison sees no change and the cascade halts after 1–2 iterations.

**Three fragilities:**
1. The termination guarantee rests on **numeric rounding**, not on any structural protection. Neither bus has re-entrancy detection or an event-depth limit.
2. The same commit that added the guard **also added** `eventBus.publish` into the loop path — the recursion edge was widened at the moment it was patched.
3. The `presence.updated` exclusion in the bridge is almost certainly a second mitigation for the same incident, applied at the bridge rather than at the source. The consequence is that the one event type GENESIS receives is also the one type that is never persisted.

**Direct implication for any merge:** unifying the buses re-opens this loop for *every* event type, because `saveMemory()` writes to the store and the store notifies presence. Any reconciliation **must** include either (a) a re-entrancy/depth guard on the bus, or (b) removal of `saveMemory()`'s write into `akira-store` — which §9 recommends for independent reasons.

---

## 8. Architecture Options

Evaluated against AKIRA's stated principles: dependency direction AKIRA OS → GENESIS, GENESIS independence, module extensibility, event persistence, replay, recursion risk, failure isolation.

### Option A — Single canonical event bus

```
Application ──► AKIRA Event Bus ──┬──► Timeline
                                  ├──► Analytics
                                  ├──► Event Store
                                  └──► GENESIS (consumes AkiraEvent directly)
```

| | |
| :--- | :--- |
| **Advantages** | One mental model. One place to add a consumer. Ordering is total within the bus. Eliminates the bridge and its silent loss. The instrumentation bus already has the envelope, middleware, validation and store. |
| **Disadvantages** | GENESIS becomes coupled to the `AkiraEvent` envelope and to every platform event type — the opposite of the `WorkspaceProvider` discipline that the audit found to be AKIRA's best boundary. The bus has **no wildcard**, so GENESIS must register a concrete subscriber and filter internally anyway — meaning an adapter appears regardless, just unnamed and inside GENESIS. GENESIS still needs `MemoryEvent` (title/description/relatedProjectId), so the translation in `event-service.ts` survives but with no clear home. Does not by itself give GENESIS replay. |
| **Migration complexity** | Medium. Move 3 presence publishers, retire the legacy bus, register a GENESIS subscriber, fix the contract. |
| **Recursion risk** | **Increased.** Every event type enters the `record → saveMemory → akira.set → presence → publish` path that §7.3 documents. Needs an explicit guard. |
| **Failure isolation** | Unchanged (per-subscriber `try/catch`); GENESIS failures cannot break the platform. But a GENESIS bug now sits on the platform's hot path. |
| **Long-term scalability** | Good for the platform; weak for cognition. Every new platform event type is automatically GENESIS's problem. |

### Option B — Platform bus + GENESIS Cognitive Event Adapter

```
Application ──► AKIRA OS Event Bus ──┬──► Timeline
                                     ├──► Analytics
                                     ├──► Event Store  ◄── canonical reality
                                     │        │
                                     │        │ replay (findBetween)
                                     ▼        ▼
                            GENESIS Event Adapter
                          (allowlist · translate · dedupe)
                                     │
                                     ▼
                            MemoryEvent → candidates → memories → …
```

| | |
| :--- | :--- |
| **Advantages** | Matches the architecture that already exists: the `switch` in `event-service.ts` **is** this adapter, just misplaced and wired to the wrong bus. Keeps `MemoryEvent` as GENESIS's own vocabulary. One explicit, testable place for the allowlist, the `AkiraEvent → MemoryEvent` translation, and idempotency. Mirrors the `WorkspaceProvider` pattern — AKIRA's proven seam. The adapter can consume **both** live events and Event Store replay, which is exactly what cross-session reconstruction (audit CRIT-004) requires. Platform event types can be added without touching GENESIS. |
| **Disadvantages** | One more named component. The allowlist must be maintained (though it exists today, implicitly, as the `switch`). Two vocabularies (`AkiraEvent`, `MemoryEvent`) remain — a real cost, but they model genuinely different things. |
| **Migration complexity** | Medium — essentially the same work as Option A, plus giving the adapter a file of its own. |
| **Recursion risk** | **Containable.** The adapter is a natural choke point for a depth/re-entrancy guard, and it is the natural place to stop `saveMemory()` writing back into `akira-store`. |
| **Failure isolation** | **Best.** An adapter fault is isolated to the adapter; the platform bus, Timeline, Analytics and Event Store are unaffected. |
| **Long-term scalability** | Best. Third-party modules publish to the platform bus with no knowledge of GENESIS; GENESIS opts into what it can interpret. |

### Option C — Keep both buses and add a reverse bridge

| | |
| :--- | :--- |
| **Advantages** | Smallest immediate diff. |
| **Disadvantages** | Creates a **cycle** between two buses — a direct duplication and infinite-forwarding hazard, aggravated by §7.3. Preserves two envelopes, two subscription models, two error philosophies. Doubles the surfaces where an event can be silently lost. Keeps the `presence.updated` exclusion special case. |
| **Recursion risk** | **Highest.** Bidirectional bridges plus a store-notify loop. |
| **Assessment** | **Rejected.** This is the shape that produced the current defect. |

### Option D — Event-Store-first (GENESIS reads only the durable log)

| | |
| :--- | :--- |
| **Advantages** | Perfect replay symmetry — live and historical use one code path. GENESIS can never see an event the platform failed to persist, so the Event Store / cognition divergence (audit DAT-005) becomes impossible by construction. |
| **Disadvantages** | Latency: cognition lags by the persistence round trip, and `publish()` is async client→server. Requires polling or a change feed, neither of which exists. Requires a durable cursor. Substantially more new machinery than Option B. |
| **Assessment** | Right long-term shape, too large a step now. **Option B is a strict subset of it** — the adapter is where the change feed would later attach. |

---

## 9. Recommended Reconciliation Strategy

### **Option B — one platform bus, one Event Store, one GENESIS Cognitive Event Adapter.**

Chosen because it is the architecture the code is already *reaching for*: the `switch` in `event-service.ts:94-160` is a translation adapter that was attached to the wrong bus, and the Event Store already provides the replay primitive that GENESIS's `reconstructRuntimeMemory()` needs and cannot currently use. Option B formalises what exists rather than introducing a new concept, and it is the only option that both preserves GENESIS independence and provides replay.

| Decision | Recommendation |
| :--- | :--- |
| **Canonical source of reality** | The **`events` table** (Event Store). The instrumentation bus is the live transport; the table is the truth. Live delivery and replay must produce identical cognitive results. |
| **Event ownership** | **AKIRA OS owns platform event types and the `AkiraEvent` envelope.** GENESIS owns `MemoryEvent` and its own cognitive vocabulary. Neither reaches into the other's shape. `src/contracts/events.ts` stays the shared registry — and becomes the **only** legal way to name an event (today 25 of 25 publishers use bare literals). |
| **Direction of flow** | Strictly one-way: `AKIRA OS → Event Store → GENESIS Adapter → GENESIS`. **No reverse bridge, ever.** GENESIS must never publish onto the platform bus; if cognitive output needs to be observable, it gets its own downstream channel. |
| **GENESIS integration boundary** | A single new module — `src/genesis/events/reality-adapter.ts` — implementing `EventSubscriber` (`{id: "genesis-reality-adapter", onEvent}`), holding: (1) the explicit allowlist of platform types GENESIS interprets, (2) the `AkiraEvent → MemoryEvent` translation currently in the `switch`, (3) idempotency keyed on `AkiraEvent.id`. This is the *only* file that knows both vocabularies. |
| **Persistence strategy** | **Delete the `saveMemory() → state.memories` path.** It is a non-durable duplicate of the Event Store and one leg of the recursion loop (§7.3). `getInitialState()`'s hard-coded `memories: []` (audit CRIT-004) then has nothing to lie about. GENESIS keeps deriving memories from events — the design was always event-sourced; it simply had no durable source. |
| **Replay strategy** | On boot, the adapter reads the Event Store forward from a persisted cursor via `findBetween`, feeding the *same* `onEvent` path as live delivery. **Prerequisites:** add a monotonic tiebreaker to the 4 unordered query methods (audit PLT-006 — the table already has `rowid`, and `latest()` already uses it), and key the cursor on `(timestamp, rowid)` not `timestamp + 1ms` (audit PLT-015). Idempotency on `AkiraEvent.id` makes replay safe to re-run. |
| **Error handling strategy** | Three changes to the current "log and continue" posture: (a) the adapter surfaces failures as a counted, inspectable outcome rather than `console.error`; (b) `PersistenceSubscriber` failures must not return success to the caller (audit PLT-007) — persistence is the canonical write and must be ordered *before* fan-out; (c) delete both `.catch(() => {})` handlers with the bridge itself. |
| **Recursion control** | Removing `saveMemory()`'s store write cuts the documented loop at its source. Add a depth/re-entrancy guard on the bus as defence in depth, and drop the `presence.updated` exclusion so presence becomes persistable like everything else. |

### Ordering constraint — fix the contract before connecting the buses

`events.type` and `timeline_events.event_type` store raw event strings, and the live database currently holds **1 test row and 0 timeline rows** (§6.3). Renaming is free today and expensive later. **Phase 1 must land before Phase 3.**

---

## 10. Migration Proposal

**Not implemented.** Sequenced so every step is independently verifiable and reversible.

### Phase 1 — Stabilise the contract (no behaviour change)

1. Resolve the duplicate keys: rename lines 76-77 to `PLANNING_TASK_CREATED` / `PLANNING_TASK_COMPLETED`, restoring `TASK_CREATED = "task.created"` and `TASK_COMPLETED = "task.completed"`. Update `TaskService.ts:44,93`. **Clears the last 2 Phase A `tsc` errors.**
2. Reconcile `note.updated` vs `note.edited` — pick one, update the publisher, the registry, the Timeline allowlist, the GENESIS `switch` and the candidate rule together.
3. Add the 4 undeclared published types (`task.reopened`, `settings.updated`, `search.executed`, plus whichever note name is retired) to the registry, and decide for each whether the Timeline should carry it.
4. Replace all 25 bare string literals in `akira-store.ts`, `VaultStorageService.ts`, `VaultFolderService.ts` and `search/services/index.ts` with `Events.*` constants.
5. Add a contract test — the reconciliation script written for this phase is a working prototype — asserting: no duplicate keys; every published literal exists in the registry; every Timeline allowlist entry is published; every GENESIS `switch` case resolves to a published value.

**Exit criteria:** `tsc` = 0 errors. Build passes. Test suite ≥ 327 passing. The contract test is green and in CI.

### Phase 2 — Introduce the adapter, dormant

6. Create `src/genesis/events/reality-adapter.ts` as an `EventSubscriber`, moving the translation out of `event-service.ts:94-160` **unchanged**, with the allowlist made explicit and idempotency on `AkiraEvent.id`.
7. Unit-test it against fixture `AkiraEvent`s for all 25 production types: correct translation, allowlist rejection, duplicate-id suppression.
8. **Do not register it.** No runtime behaviour changes.

**Exit criteria:** adapter fully covered by tests; production behaviour byte-identical.

### Phase 3 — Dual-run verification (the first real traffic this path will ever carry)

9. Register the adapter on `globalEventBus` **in shadow mode**: translate and count, but do not emit into `candidateService`.
10. Register `AnalyticsSubscriber` (currently never registered — §3.2) in the same pass, since it has the same wiring gap.
11. Replace the per-request subscriber scan (audit PLT-013) with explicit server-startup registration in `src/server.ts` via the existing, unused `EventService.start()`.
12. Run the app normally. Compare, per event type: published count vs `events` rows vs `timeline_events` rows vs adapter-translated count.

**This is the step that matters most.** §4.8 establishes the pipeline has never carried real traffic — the empty tables reflect absence of exercise, not proven failure. Phase 3 is the first opportunity to learn whether `publish()` actually reaches the server RPC in a real session, and it will surface the swallowed errors (audit PLT-007/PLT-008) as measurable gaps.

**Exit criteria:** published = persisted = translated for every allowlisted type across a real session. Any discrepancy explained before proceeding.

### Phase 4 — Cut the cognitive path over

13. Enable the adapter's emit path into `candidateService`.
14. Remove the legacy-bus `"*"` subscription from `event-service.ts`.
15. **Delete the `saveMemory() → state.memories` path** and `getInitialState()`'s `memories: []`.
16. Add Event Store replay on boot: persisted cursor → `findBetween` → the adapter's `onEvent`. Requires the ordering tiebreaker and the `(timestamp, rowid)` cursor from §9.
17. Add candidate rules for the newly-visible types (`session.started/ended`, `vault.*`) or explicitly document their exclusion. Fix the "Project Completed" rule's `metadata.patch` expectation (§6.8).
18. Separate GENESIS's 8 self-recorded `note_created` events into their own internal event type so cognitive lifecycle events stop masquerading as user notes (audit GEN-003).

**Exit criteria:** completing a task produces a memory. Memories survive a restart. A restart reproduces the same memory set from the same events (replay determinism test).

### Phase 5 — Retire the legacy architecture

19. Move `presenceService`'s 3 publishers to `publish()`; drop the `presence.updated` bridge exclusion.
20. Move the 12 runtime lifecycle/capability publishers to the platform bus.
21. Delete `src/shared/infrastructure/event-bus/` — removing the `shared → instrumentation` upward edge (audit BND-006) and, with `persistence/connection.ts`'s search-cache patch, part of the 19-file dependency cycle (audit BND-005).
22. Add the bus re-entrancy/depth guard.
23. Decide the fate of the 9 local emitters. **Recommendation: keep them.** They form the only fully-working event mesh in the system (§3.9) and are correctly scoped to intra-GENESIS coordination.

**Exit criteria:** one bus, one store, one adapter. No `presence.updated` special case. No cycle between `shared/` and `instrumentation/`.

### Explicitly out of scope for this migration

GENESIS v2.19+ feature work; the `src/diagnostics/` decision (Phase A §6); the `GoalStatus`/`GoalCategory`/`createDefaultStrategyRegistry` naming collisions (Phase A §8); prompt token budgeting (audit GEN-006) — though that becomes urgent the moment Phase 4 lands, because memories will finally accumulate.

---

## Phase B compliance

| Constraint | Status |
| :--- | :--- |
| Do not redesign the event system | ✅ Investigation and recommendation only |
| Do not unify buses | ✅ Not touched |
| Do not add or remove bridges | ✅ Not touched |
| Do not modify GENESIS subscriptions | ✅ Not touched |
| Do not modify workspace event publishing | ✅ Not touched |
| No source modification | ✅ `git status` after Phase B is byte-identical to after Phase A |
| Diagnostic mechanisms | Two throwaway test files (runtime constant probe; contract reconciliation), both deleted. Live DB inspected via a **copy**, read-only; original mtime unchanged; no secret value printed. |
| Prefer repository inspection | ✅ Static analysis and Git history are the primary evidence throughout |
