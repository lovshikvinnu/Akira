# AKIRA Deep Scan — Chat 4 Findings

Territory: infrastructure, runtime and platform plumbing.
HEAD at scan start: `a560475`.

Excluded by brief and not rescanned: the persistence FK/ordering race, the six
Event Bus import violations and the presence-channel seam, the three architecture
validator repairs, and the GENESIS cognitive/context work.

---

## Scan coverage

| Subsystem                                                                   | Status                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Application bootstrapping (`routes/__root.tsx`)                             | Fully scanned                                              |
| Service lifecycle — initialize/shutdown symmetry                            | Fully scanned                                              |
| Double initialization / stale subscriptions                                 | Fully scanned                                              |
| Restart / state reconstruction                                              | Fully scanned                                              |
| Dead & orphaned subsystems (`runtime`, `sdk`, `compatibility`, `analytics`) | Fully scanned                                              |
| Observability — health registry, telemetry pipeline, sink                   | Fully scanned                                              |
| Error handling — swallowed exceptions                                       | Fully scanned (first pass)                                 |
| Event infrastructure — two buses, contract drift, delivery to cognition | Fully scanned |
| Reality/platform bridge (`reality-adapter`) | Fully scanned |
| Caching and invalidation — coherence after deletion | Fully scanned |
| Client/server boundaries                                                    | Partially scanned                                          |
| Analytics runtime behaviour                                                 | Not applicable — subsystem unreachable (see below)         |
| Retry behaviour                                                             | Not applicable — no retry mechanism exists to audit        |

---

## Confirmed bugs

### 1. Derived context-engine state is discarded on restart while its source data survives

**Severity:** Medium-High (silent loss of accumulated user knowledge)

**Affected infrastructure:** service lifecycle, state synchronization, restart behaviour

**Production lifecycle/path:**

```text
session 1: user types "@Sarah reviewed the plan"
    -> akira.addChatMessage  -> chat persisted to settings key "chat"
    -> relationshipService.processNewChatMessages
    -> recordObservation("Sarah") -> importantPeople = [Sarah]

app restart
    -> getInitialState() restores chat from SQLite   (source data intact)
    -> __root effect: relationshipService.initialize()
         this.relationships = []                      (derived state cleared)
         this.lastProcessedChatTime = Date.now()      (history skipped)
    -> importantPeople = []
```

**Failure scenario:** any restart. The user's contacts, habits and reflection
history are session-scoped without that being stated anywhere in the product.

**Observed behaviour** (measured, `tests/zz-c4-lifecycle.bench.ts`):

```text
session 1 contacts                Sarah, Daniel
session 1 chat messages           2
session 2 chat messages (durable) 2
session 2 contacts                none
  @mentions still present in chat 2
```

**Expected behaviour:** either the derived state is rebuilt from the durable
chat log on boot, or the engines are documented as session-scoped and the UI
does not imply otherwise.

**Root cause:** `relationships/service.ts:70-72` clears `this.relationships` and
sets `lastProcessedChatTime = Date.now()` on every `initialize()`. The comment
("only process new chat messages during this session") shows the skip is
deliberate; the interaction with the unconditional `relationships = []` reset
is what loses rebuildable state. `habits/service.ts:26-28` has the same shape
(`habits = []`, `evidenceLog = []`); `reflection/service.ts:21` resets
`historicalReports` to `[]` because `__root` calls `initialize()` with no
argument.

**Evidence:** the bench above; plus no persistence exists for any of the three —
the only persisted settings keys are `chat`, `genesis_memories`,
`last_project_id`, `profile`, `streaks`.

**Reproduction status:** reproduced deterministically.

**Residual paths checked:**

- No repository, table or settings key for habits/relationships/reflection.
- `setHistoricalReports` (the injection seam for reflection) has no caller, so
  reflection cannot be restored even in principle.
- `memoryService.initialize()` _is_ re-run after the DB loads (`__root.tsx:242`),
  which is why memories/stories/understanding do survive. The other seven
  services initialized in the boot effect are not re-run.

**Suggested fix direction:** rebuild from the durable stream rather than adding
a new persistence path — the chat log already contains every `@mention`.
Dropping the `lastProcessedChatTime = Date.now()` skip on a cold boot would
reconstruct contacts the same way `memoryService` reconstructs cognition. Habits
have the same option via workspace events. Reflection needs a product decision:
its reports have no durable home at all.

---

## Suspected issues

### Boot-order dependency in `companionStateService.bootstrap()`

`bootstrap()` throws `"Cannot bootstrap Companion State: Presence Engine is not
initialized"` unless a presence context has already been published. `__root.tsx`
happens to call `presenceService.initialize()` two lines earlier, so it works.

What remains unknown: whether any other entry point (tests, a future route, a
server-side render) reaches `bootstrap()` without presence. I confirmed the
throw exists and that the ordering is implicit rather than enforced, but I have
not found a production path that violates it. Reported as a fragility, not a bug.

### Seven services initialize against an empty workspace at boot

`__root.tsx` runs the boot effect synchronously while `initializeDatabaseState()`
is still awaiting SQLite. The file's own comment documents this for
`memoryService` and re-runs it afterwards. The other seven are not re-run.

For relationships/habits this compounds bug 1 above. For
`contextResolutionService`, `initiativeService`, `timelineService` and
`presenceService` I have not yet measured whether initializing against an empty
store leaves any incorrect derived state once data arrives — they subscribe to
the store, so they may self-correct on the first change. Unverified.

### `TASK_CREATED` is published and never translated

`akira-store` publishes `task.created` on every task creation and
`event-translation` has no translator for it, so `reality-adapter` drops it and
GENESIS never learns a task was created. Measured:

```text
platform events published   project.created, task.created, task.completed,
                            mission.completed, note.created, note.edited
cognitive events recorded   project_created, task_completed, mission_completed,
                            note_created, note_edited
```

What remains unknown: whether this is deliberate. The codebase narrows what
becomes memory on purpose -- `task_completed` is the signal that matters and
creating a task is arguably noise -- and the same file deliberately omits
translators for other events. I found no comment stating the intent either way,
so this is a decision to confirm rather than a defect to fix.

---

## Dead / duplicate / orphaned infrastructure

> **Correction, made during the hardening pass.** The classifications below were
> reached by tracing callers and not by reading `docs/adr/`. That was the wrong
> method and the verdicts it produced are withdrawn. `src/runtime/` is the
> subject of five **Accepted** ADRs -- 016 platform runtime, 017 module
> manifest, 018 dependency resolution, 019 lifecycle manager, 020 capability
> registry. `src/analytics/` is the subject of four -- 011, 012, 013, 015, the
> last **Accepted**. ADR-016 line 30 names the Platform SDK as Sprint 1.5 work,
> and `docs/SDK.md` and `docs/RUNTIME.md` describe both it and the runtime.
>
> None of these is dead. They are accepted architecture with their integration
> sprint still ahead, and "no current caller" is the expected state for that,
> not evidence against it. Read the rows below as **reachability measurements**,
> which they are and which still hold, rather than as removal recommendations,
> which they should never have been.


| System                                                                                       | Producer/initializer                          | Consumer                                 | Unique capability                                                                            | Classification                          | Recommendation                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/runtime/` (`RuntimeManager`, `LifecycleManager`, `ModuleInstance`, dependency resolver) | none                                          | none — zero importers anywhere in `src/` | A module lifecycle system: startup/shutdown ordering, fault isolation, dependency resolution | **DEAD**                                | Nothing in production would change if removed. `docs/LIFECYCLE.md` and `ADR-016` describe it as the platform runtime, so deletion is a documentation decision as much as a code one.                                                                                           |
| `src/compatibility/`                                                                         | none                                          | none — zero external importers           | Adapter layer over the SDK                                                                   | **DEAD** (head of an unreachable tower) | Remove with the tower or state the intended consumer.                                                                                                                                                                                                                          |
| `src/sdk/`                                                                                   | none                                          | only `src/compatibility`                 | Public SDK surface                                                                           | **ORPHANED**                            | Reachable only from dead code.                                                                                                                                                                                                                                                 |
| `src/analytics/`                                                                             | none                                          | only `src/sdk`                           | Event aggregation, metric calculators, dashboards                                            | **ORPHANED**                            | Same closed loop: `compatibility -> sdk -> analytics`, entered from nowhere. Note: an earlier optimisation of `AnalyticsEngine.aggregateEvents` (commit `324687a`) was therefore applied to code with no production path. It remains correct; it just buys nothing at runtime. |
| `TelemetryStore` (`observability/store`)                                                     | `composition.ts` sets it as the pipeline sink | none                                     | Retains telemetry records including health transitions                                       | **ORPHANED**                            | Write-only. Health failures are recorded and never displayed, exported or asserted on. The two UI hits for "telemetry" in `brain.tsx`/`chat.tsx` are label strings about GENESIS candidates, not this store.                                                                   |
| `reflectionService.setHistoricalReports`                                                     | none                                          | none                                     | The only way reflection history could be restored                                            | **ORPHANED**                            | Either wire a caller or delete, so the restart behaviour stops looking recoverable.                                                                                                                                                                                            |

---

## Weak tests and validation

- **`tests/lifecycle.test.ts` tests a subsystem nothing runs.** It exercises
  `src/runtime`'s `LifecycleManager`. The tests are green and the code is
  unreachable, which is the "everyone assumes it works" case the brief names.
- **Analytics tests likewise.** `src/analytics/tests/analytics.test.ts` passes
  against an unreachable subsystem.
- No inert or name-based checks found in the architecture validator beyond the
  four already repaired.

---

## Healthy infrastructure verified

Each of these was traced through its real production path, not just its imports.

- **Boot init/teardown symmetry.** Eight services initialize in `__root.tsx`'s
  boot effect and eight tear down in its cleanup — `companionStateService`
  pairs `bootstrap()` with `closeSession()` rather than `shutdown()`, which is
  why a name-based reading of the list looks asymmetric and is not.
- **Double-initialization is guarded** where it matters. `presence`,
  `relationships` and `habits` each call the previous `storeUnsubscribe` before
  re-subscribing; `initiativeService` and `contextResolutionService` release
  their handles first. React StrictMode's double-effect in development therefore
  does not leak store listeners.
- **Production error handling does not swallow.** The only empty `catch {}`
  blocks in `src/` are two in `vault.test.ts`. `reality-adapter` logs and
  continues by design (documented at its catch), and `composition.ts` attaches a
  rejection handler to its fire-and-forget telemetry write.

- **The event pipeline severance described in `docs/recovery/` is remediated.**
  That document names four confirmed failure paths -- task completion not
  reaching consumers, presence yielding nothing, note editing invisible, and a
  duplicate `TASK_COMPLETED` key where the later Planning declaration silently
  won. All are closed at this HEAD. The registry now namespaces the Planning
  keys (`PLANNING_TASK_CREATED`/`PLANNING_TASK_COMPLETED`), no duplicate keys
  remain, `Events.TASK_COMPLETED` resolves to `"task.completed"`, and both the
  task completion and the note edit reach cognition and produce memories:

  ```text
  TASK_COMPLETED constant             task.completed
  task_completed reached cognition    true
  note_edited reached cognition       true
  memories mentioning the task        1
  memories mentioning the edit        1
  ```

  Recorded here so the document is not re-reported as a live bug list. It is
  accurate history and a stale defect report.

- **Cache coherence after deletion.** Five caches were asked about a deleted
  project immediately after `deleteProject`, with no intervening event:

  ```text
  memories naming it (history)     2     expected -- append-only
  story cache                      0
  recall cache                     3     historical memories, past tense
  understanding graph              1     status Archived
  context package goals            none  only the surviving project
  ```

  The recall and memory hits are past-tense records ("Started new project:
  KitchenRemodel"), which is history rather than a current-state claim. The two
  caches that make present-tense claims -- the context package's goals and the
  understanding's status -- are both correct.

---

## Final infrastructure inventory

| System                                                              | Scan status       | Bugs | Lifecycle status | Architecture status | Notes                                                                                       |
| ------------------------------------------------------------------- | ----------------- | ---: | ---------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| Application bootstrap (`__root.tsx`)                                | Full              |    0 | Healthy          | Sound               | Async DB load races the sync boot effect; documented and mitigated for `memoryService` only |
| Service lifecycle / double init                                     | Full              |    0 | Healthy          | Sound               | Unsubscribe-before-resubscribe throughout                                                   |
| Restart / reconstruction                                            | Full              |    1 | **Defective**    | Needs decision      | Bug 1 — derived state discarded, source data intact                                         |
| `src/runtime`                                                       | Full              |    0 | **Never starts** | Dead                | Zero importers                                                                              |
| `compatibility → sdk → analytics`                                   | Full              |    0 | **Never starts** | Dead/orphaned       | Closed loop, unreachable                                                                    |
| Observability — health registry                                     | Full              |    0 | Healthy          | Sound               | One writer (persistence), one subscriber                                                    |
| Observability — telemetry sink                                      | Full              |    0 | **Write-only**   | Orphaned            | Records nothing reads                                                                       |
| Error handling                                                      | Full (first pass) |    0 | Healthy          | Sound               | No production swallowing                                                                    |
| Event infrastructure (two buses, contract drift) | Full | 0 | Healthy | Sound | Severance doc verified stale; all four documented failure paths closed |
| Reality/platform bridge | Full | 0 | Healthy | Sound | Drops untranslatable events by design; `task.created` untranslated (decision) |
| Caching and invalidation | Full | 0 | Healthy | Sound | Five caches checked immediately after deletion; present-tense channels correct |
| Client/server boundaries                                            | Partial           |    — | Unknown          | —                   | Next area                                                                                   |
| Retry behaviour                                                     | N/A               |    — | —                | —                   | No retry mechanism exists                                                                   |
