# 05 — GENESIS Master Audit

Stated status under audit: **v2.17 REMEMBER — COMPLETE**, **v2.18 UNDERSTAND — COMPLETE**, **v2.19 IDENTITY — NEXT**.
Measured: v2.19 IDENTITY is already implemented (17 files, 15 services, 1,205-line test suite, git commit `45f3b5a release(genesis): v2.19.0 Identity Capability`). v2.17 and v2.18 are structurally complete but **functionally unreachable** because their input is severed and their output is not durable.

---

## The pipeline, as intended vs as wired

```
INTENDED                                  ACTUAL
────────                                  ──────
Reality (workspace)                       Reality (workspace)
   │ events                                  │ publish() → instrumentation bus
   ▼                                         ▼
Events                                    events table (SQLite)   ─── dead end for GENESIS
   │                                         ╳  no bridge back
   ▼                                      ┌─────────────────────────┐
Memory Candidates                         │ legacy eventBus         │
   ▼                                      │  only "presence.updated"│
Validation                                └──────────┬──────────────┘
   ▼                                                 ▼
Memories ────────────────► persisted            eventService.record()
   ▼                                                 │ saveMemory() → in-memory store only
Stories                                              ▼
   ▼                                          candidate → validate → Memory[]  (process-local array)
Understanding                                        ▼
   ▼                                          stories / understanding / insights (process-local arrays)
Insights                                             ▼
   ▼                                          prompt assembly (no size budget)
Context ─────────────────► AI Provider               ▼
                                              AI Provider (browser → 3rd party, key in client)
```

Three independent breaks: **input** (GEN-001), **durability** (GEN-002), and **self-contamination** (GEN-003).

---

## GEN-001 — CRITICAL — GENESIS observes no reality

Full evidence in `02-architecture-boundaries.md` BND-001 and BND-002. Summary of the consequence for the cognitive pipeline:

`src/genesis/events/event-service.ts:94-160` maps legacy-bus events onto `MemoryEvent["eventType"]`. Its eight cases are `project_created`, `project_updated`, `project_continued`, `task_completed`, `mission_completed`, `note_created`, `note_edited`, `presence_updated`. Of these:

| Case | Reachable? | Why |
| :--- | :--- | :--- |
| `presence_updated` | **Yes** | `presenceService` publishes `Events.PRESENCE_UPDATED` on the legacy bus (3 sites) |
| `project_*`, `note_*`, `mission_completed` | No | `akira-store.ts` publishes these to the instrumentation bus only |
| `task_completed` | No, twice over | Not on the legacy bus **and** `Events.TASK_COMPLETED` resolves to `"planning.task.completed"` due to the duplicate-key bug (BND-002) |

Then `src/genesis/candidate/candidate-rules.ts` gates candidate generation on `event.eventType`. So the candidate engine sees `presence_updated` events and GENESIS's own synthetic `note_created` events (GEN-003) — nothing else.

**Downstream cascade (all mechanical consequences, not separate defects):**
`candidateService` → few/no candidates → `validator` → no promoted `Memory` → `memoryService.subscribe` never fires → `understandingEngine.rebuildGraph()` sees an empty memory set → `insightEngine` derives nothing → `recallService` index is empty → `contextRelevanceSelector` has no `contextPackage` → the AI receives a system instruction containing intent metadata and project names only.

**Verifiable prediction:** in a running instance, `memoryService.getMemories()` after normal workspace use will contain only entries whose `title` is `"Companion State Bootstrapped"` or `"Presence Context Resolved"`.

---

## GEN-002 — CRITICAL — No cognitive state survives a restart; the reconstruction path is dead code

**Finding:** every GENESIS store is a module-scope JavaScript array. Nothing is serialised to disk. The one reconstruction mechanism reads a field that is hard-coded empty.

**Storage inventory:**

| Store | Declaration | Durable? |
| :--- | :--- | :--- |
| Memory candidates | `src/genesis/candidate/candidate-service.ts:10` — `const candidateHistory: MemoryCandidate[] = []` | No |
| Memories | `src/genesis/memory/memory-service.ts:16` — `const memories: Memory[] = []` | No |
| Stories | `src/genesis/stories/story-service.ts:9` — `const storyCache: Story[] = []` | No |
| Understandings | `src/genesis/understanding/engine.ts:8` — `let understandings: Understanding[] = []` | No |
| Insights | `src/genesis/insights/insight-engine.ts` — module array | No |
| Recall index | `src/genesis/recall/recall-service.ts` — module array | No |
| Identity graph | `src/genesis/identity/repositories/InMemoryIdentityRepository.ts` (421 LOC) | No |
| Plans/milestones/tasks | `src/genesis/planning/repositories/InMemory*Repository.ts` (7 files) | No |
| AI provider config | `settingsService` → SQLite `settings` table | **Yes** (the only durable GENESIS state) |

There is no `Sqlite*Repository` anywhere under `src/genesis/`. The two files named "serializer" (`understanding/serializer.ts`, `insights/insight-serializer.ts`) are **natural-language renderers for AI prompts**, not persistence serialisers — they emit sentences like `"Goal Alignment\nCurrent learning activities directly reinforce long-term goals.\nConfidence: High (0.9)"`.

**The reconstruction path and why it cannot fire:**

`src/genesis/memory/memory-service.ts:98-124`
```ts
reconstructRuntimeMemory(): void {
  const storeMemories = getMemories();                 // shared/genesis-provider
  if (storeMemories && storeMemories.length > 0) {     // ← never true
    candidateService.clearHistory();
    this.clearHistory();
    recallService.clearHistory();
    clearListeners.forEach(l => l());
    const events = [...storeMemories].reverse();
    for (const event of events) candidateService.evaluateEvent(event);
  }
}
```

`getMemories()` → `storeProvider.getMemories()` → `src/persistence/akira-store.ts:918` → `state.memories`.

`state.memories` is populated only by `akira.initializeState(state)` in `src/routes/__root.tsx:233`, whose input is `getInitialState()`:

`src/persistence/store-init.ts` (end of the returned object)
```ts
return {
  projects, tasks, notes, sessions, activeSession, profile, lastProjectId, chat, streaks,
  memories: [],                    // ← hard-coded empty, always
  vaultFiles, vaultFolders,
};
```

And `saveMemory` never reaches the database at all — `src/persistence/akira-store.ts:920-925`:
```ts
saveMemory: (event) => { set((s) => ({ ...s, memories: [event, ...s.memories] })); }
```
No RPC, no repository, no `settingsService` write. There is no `memories` table in `schema.sql`.

**Risk:** the entire "REMEMBER" capability is session-local. A page reload, a `vite dev` restart, or closing the app discards every memory, story, understanding, insight, identity node and plan. `memoryService.initialize()`'s two-step comment ("1. Reconstruct Runtime Memory / 2. Build Recall Index") describes behaviour that cannot occur.

**Secondary defect in the same function:** the guard `if (storeMemories.length > 0)` means that when the store *is* empty, the clear-listeners never fire — so if reconstruction were ever wired up, a legitimate "empty history" case would leave downstream services holding stale state instead of clearing them.

**Tertiary defect:** `[...storeMemories].reverse()` hard-codes the assumption that the store keeps memories newest-first. That is true today (`saveMemory` prepends) but is an undocumented coupling between the cognitive layer's replay order and the platform store's insertion order.

---

## GEN-003 — HIGH — GENESIS records its own lifecycle as user reality, mislabelled as a note

**Location:** `src/genesis/context/state/service.ts:60-67`
```ts
eventService.record(
  "note_created",                                   // ← event type is a lie
  "Companion State Bootstrapped",
  `Handoff complete. Sole ownership transitioned to Companion State. Intent: ${state.currentFocus}`,
  state.activeProject?.id, null, { state },         // ← full state object in metadata
);
```

**Risk chain:**
1. `eventService.record` → `saveMemory(event)` → the event enters `state.memories`, the array the workspace considers user activity.
2. → `callbacks` → `candidateService.evaluateEvent(event)` → candidate rules keyed on `"note_created"` treat it as a user-authored note.
3. → promoted to a `Memory` → feeds `understandingEngine`, `storyService`, `insightEngine`, `habitService`.
4. `bootstrap()` is invoked from **two** call sites (`__root.tsx:248`, `chat.tsx:596`) and is not idempotent (DEP-004), so each navigation to `/chat` injects another one.
5. The `metadata: { state }` payload embeds the entire `CompanionState`, so the memory carries a snapshot of GENESIS's own internals.

**Combined with GEN-001**, this is the dominant source of GENESIS memories: the cognitive layer's memory of the user is mostly a memory of itself booting.

**Same class of issue:** `presenceService`'s 30-second decay timer (`src/akira-os/presence/service.ts:175`) publishes `PRESENCE_UPDATED` whenever a rounded confidence value changes, and `eventService` records each one as a `presence_updated` memory event. Over a long session this is the only growing input to the memory pipeline.

---

## GEN-004 — HIGH — Candidate → validation pipeline has no duplicate detection

**Finding:** nothing in the promote path checks whether an equivalent memory already exists.

- `src/genesis/candidate/candidate-service.ts:47-77` — `evaluateEvent` returns on the **first** matching rule and unconditionally `unshift`es a new candidate with a fresh `uid()`. No dedup on `sourceEventId`.
- `src/genesis/memory/memory-service.ts:52-80` — `processCandidate` unconditionally `push`es a new `Memory` with a fresh `uid()`. No dedup on `candidateId`, `sourceEventId`, or content.

**Failure scenario:** if `reconstructRuntimeMemory` were ever fixed (GEN-002) it would replay the whole event history through `candidateService.evaluateEvent`. It calls `clearHistory()` on candidates, memories and recall first — but `storyService`, `understandingEngine`, `insightEngine`, `habitService`, `goalService`, `knowledgeService` and `relationshipService` are cleared only if they subscribed via `memoryService.subscribeClear`. Only `understandingEngine` does (`engine.ts:112`). So a reconstruction would duplicate every story, insight, habit and knowledge node.

**Related:** `Memory.candidateId` and `Memory.sourceEventId` are recorded, so the data needed for idempotency is present and simply not used.

---

## GEN-005 — HIGH — Encapsulation: every collection getter returns the live internal array

| Getter | Returns |
| :--- | :--- |
| `memoryService.getMemories()` | `memories` — the module array itself |
| `candidateService.getCandidates()` | `candidateHistory` |
| `storyService.getStories()` | `storyCache` |
| `understandingEngine.getUnderstandings()` | `understandings` — with the doc comment *"Returns the current **immutable** array of understandings"* |
| `insightEngine.getInsights()` | module array |

**Risk:** any consumer — including `src/routes/brain.tsx` (2,106 lines, fan-out 24) and every future module — can `push`, `splice` or reorder the cognitive layer's state with no event emitted and no listener notified. `understandingEngine`'s change detection compares element identity (`nextGraph[i] !== understandings[i]`), so an in-place mutation is invisible to it and the graph silently desynchronises from its subscribers.

`Object.freeze` or defensive copies are used nowhere in GENESIS.

---

## GEN-006 — HIGH — Prompt assembly has no token budget; context grows without bound

**Finding:** `promptBuilder.buildSystemInstruction` (`src/genesis/context/ai/prompt-builder.ts:11-79`) is purely additive across six blocks and applies no cap, slice, or truncation. `grep -n "slice(0,\|MAX_\|limit\|budget\|token"` over `prompt-builder.ts` and `context-engine.ts` → **no matches**.

Blocks appended, in order:
1. `[INTENT RESOLUTION METADATA]` — `JSON.stringify(metadata, null, 2)`, pretty-printed
2. `[COGNITIVE CONTEXT]` — `serializeContextPackage`, iterating **all** `activeCandidates`
3. `[UNDERSTANDINGS]` — `understandings.map(serializeUnderstanding).join("\n\n")`, **all** of them after category filtering
4. `[INSIGHTS]` — `insights.map(serializeInsight).join("\n\n")`; the doc comment states *"Mode A (Stable: **all** insights)"*
5. `[RESOLVED CONTEXT]` — `serializeResolvedContext`
6. `[AVAILABLE PROJECTS]` — **every** project name and tag

**Risk:** in a system whose whole purpose is accumulating memories, understandings and insights, the system prompt grows monotonically with cognitive history. There is no eviction, no relevance ranking with a cutoff (`relevance/engine.ts` scores but nothing truncates), and no measurement. The failure mode is a provider `400` for exceeding the context window, at an unpredictable point in a user's life with the app.

The absence of this cap is masked today by GEN-001/GEN-002 — the arrays never grow. Fixing those without adding a budget converts a silent failure into a loud one.

---

## GEN-007 — HIGH — Context filtering is keyed on rendered display strings

**Finding:** `src/genesis/context/context-relevance-selector.ts` decides what the AI may see by string-matching human-readable labels.

```ts
// line 51
currentGoals: contextPackage.currentGoals.filter(g => {
  const lowerGoal = g.data.toLowerCase();
  return !lowerGoal.includes("project arc:") && !lowerGoal.includes("complete project");
}),
// line 72
currentPriorities: resolvedContext.currentPriorities.filter(p =>
  !p.startsWith("Active Focus:") && !p.startsWith("Goal Priority: Project")),
// line 84
relevantContext: resolvedContext.relevantContext.filter(c => !c.startsWith("Active Project:")),
```

**Risk:** these are the guards that keep workspace/project data out of the AI prompt when the user's intent is not workspace-related — i.e. a **privacy-relevant** filter. It is implemented against presentation strings produced elsewhere (`context/goals/builder.ts`, `context-resolution/builder.ts`). Changing a label from `"Active Project:"` to `"Active project:"` silently disables the filter with no test failing. Nothing in the type system or in `tests/context-relevance.test.ts` pins these prefixes to their producers.

---

## GEN-008 — MEDIUM — Insight recency filter is triggered by substrings inside unrelated words

**Location:** `src/genesis/insights/insight-context-provider.ts:19-21`
```ts
const lower = userPrompt.toLowerCase();
if (lower.includes("new") || lower.includes("recent")) {
  // restrict to insights updated in the last 5 minutes
}
```

**Failure scenario:** the prompt `"I knew that already"` contains `"new"`. The provider switches to the 5-minute window, finds no recently-updated insights, returns `""`, and **all** insights are dropped from the AI context — silently. Same for `"renew"`, `"news"`, `"newsletter"`, `"anew"`.

---

## GEN-009 — MEDIUM — Single-user content is hard-coded inside the cognitive engines

| Location | Hard-coded content |
| :--- | :--- |
| `src/genesis/understanding/serializer.ts:11` | `if (lower === "akira") return "AKIRA";` |
| `src/genesis/understanding/serializer.ts:23-25` | `if (category === "Goal" && (lower === "pilot" \|\| lower === "pilot-license")) return "becoming a pilot";` |
| `src/genesis/context/ai/prompt-builder.ts:25-29` | `if (p === "pilot") { if (c.name === "career") return "aircraft pilot"; … }` |
| `src/genesis/insights/insight-serializer.ts:8-19` | Three hard-coded categories (`Parallel Commitments`, `Goal Alignment`, `Learning Momentum`) with fixed English sentences and a generic `default` |
| `src/persistence/store-init.ts:30-34` | Default profile `{ name: "Lovshik", role: "Developer", motto: "Building Akira" }` |
| `src/genesis/planning/repositories/InMemoryTemplateRepository.ts` (530 LOC) | Hard-coded plan templates including `"Implement Map-backed caches and persistence calls"` |

**Risk:** the "emergent identity" and "understanding" claims (ADR-003, ADR-006 in `docs/GENESIS/architecture/decisions/`) are partly satisfied by lookup tables keyed on this specific user's goals. Any new concept falls through to the `default` branch and produces the generic sentence `"The user demonstrates emergent thematic connections."` — so insight output is effectively fixed at three phrasings.

---

## GEN-010 — MEDIUM — Companion state snapshot discards three of its own fields

**Location:** `src/genesis/context/state/service.ts:222-236` — `compileSnapshotFromStore()` returns:
```ts
activeStories: [],          // ← always empty
identityObservations: [],   // ← always empty
currentConstraints: [],     // ← always empty
```
while `activeGoals`, `relevantMemories`, `recentActivity` and `initialProject` are computed.

**Risk:** the `AwarenessSnapshot → CompanionState` handoff — described in `docs/GENESIS/architecture/companion-core/02-awareness-session.md` as the mechanism by which stories and identity reach the active session — silently transfers nothing for stories or identity. `storyService` and `identityFoundationService` are both initialised and populated (in-session) yet never surface here.

---

## GEN-011 — MEDIUM — Understanding graph rebuild is O(memories × stories) per memory

**Location:** `src/genesis/understanding/engine.ts:50-70`. `rebuildGraph()` is called synchronously from three subscriptions: every promoted memory, every story event, and initialisation. Each call re-filters **all** memories and **all** stories (`isMemoryTrivial` / `isStoryTrivial` on each) and calls `buildUnderstandingGraph(memories, stories, understandings)` (`builder.ts`, 140 LOC).

**Risk:** ingesting *N* memories performs *N* full rebuilds over up to *N* memories — quadratic. `insightEngine` then subscribes to `understandingEngine`, so each rebuild cascades into insight re-derivation. Classification: **POTENTIAL RISK**, unmeasured, because GEN-001/GEN-002 keep *N* near zero today. It becomes the first bottleneck the moment memory ingestion works.

**Design credit:** the rebuild is genuinely immutable (produces `nextGraph`, replaces the reference, only notifies on change) and has real noise resistance (`TRIVIAL_PHRASES`, requiring both title *and* description to be trivial). That part is well done.

---

## GEN-012 — MEDIUM — Planning subsystem does not typecheck and is untestable at HEAD

Aggregated from `03-dependencies-and-coupling.md`:

| Defect | Location | Effect |
| :--- | :--- | :--- |
| Two files never created | `createHealthRuleEngine.ts`, `rules/HealthyRule.ts` (DEP-001) | `vite build` fails; `tests/genesis-planning.test.ts` cannot load |
| `HealthEvaluation.ruleId` vs producers' `ruleName` | 5 files (DEP-002) | Health provenance always `undefined` |
| 5 undeclared type names | `PlanningService.ts:398-427` (DEP-012) | Public return types silently `any` |

**Consequence for test confidence:** `tests/genesis-planning.test.ts` is the largest GENESIS suite — 1,533 lines, 81 `describe/it` blocks, 213 assertions — and **executes zero tests**. The Adaptive Planning / Plan Health capability has no verification whatsoever at HEAD.

---

## GEN-013 — MEDIUM — Boot-order race: GENESIS initialises against un-hydrated reality

**Location:** `src/routes/__root.tsx` — two sibling `useEffect`s.

```ts
useEffect(() => { initializeDatabaseState(); }, []);   // async: migration → getInitialState() → akira.initializeState(state)
useEffect(() => {                                       // synchronous, runs to completion first
  presenceService.initialize();
  timelineService.initialize();
  companionStateService.bootstrap();                    // → memoryService.initialize(), identity init
  goalService.initialize();  knowledgeService.initialize();
  relationshipService.initialize(); habitService.initialize();
  reflectionService.initialize(); contextResolutionService.initialize();
  initiativeService.initialize();
}, []);
```

`initializeDatabaseState` is `async` and is not awaited. React runs both effects on mount in declaration order; the first suspends at its first `await`, and the second then runs to completion. Therefore:

- `presenceService.resolveInputsFromStore()` reads `akira.getState()` before hydration → `hasPriorHistory` computed from `seed()` data → wrong `returnState`, wrong confidences, wrong `firstSessionToday`.
- `companionStateService.compileSnapshotFromStore()` reads `store.projects`, `store.chat`, `store.lastProjectId`, `store.tasks` before hydration → `initialProject: null`, `activeGoals: []`, `sessionIntent: "Unknown"`.
- `goalService`, `knowledgeService`, `relationshipService`, `habitService` each `getWorkspaceProvider().subscribe(...)` and take an initial reading of empty state.

The store subscriptions mean later hydration does emit a change — but `compileSnapshotFromStore` runs **once** at bootstrap, and `bootstrap()` is not re-run, so the awareness snapshot is permanently derived from seed data.

**Additional hazard:** `bootstrap()` throws if presence is not initialised (`service.ts:44`). It works only because `presenceService.initialize()` is fully synchronous and publishes `PRESENCE_UPDATED` before returning, which the `CompanionStateService` constructor's subscription captures. Making presence initialisation async — a natural refactor — would throw inside the effect and prevent the remaining seven GENESIS services from initialising at all, with the error surfacing only as a React error boundary.

---

## GEN-014 — LOW — `bootstrap()` throw path leaves the system half-initialised

Because `validationEngine.initialize()`, `recallBuilder.initialize()`, `memoryService.initialize()` and `identityFoundationService.initialize()` all run *before* the presence check at line 44, a `bootstrap()` failure leaves those four subscribed with no corresponding `closeSession()` ever called. `closeSession()` disposes only `recallBuilder` and `validationEngine`; `memoryService` and `identityFoundationService` have no dispose path.

---

## What is genuinely well designed in GENESIS

These should **not** be refactored:

| Area | Why |
| :--- | :--- |
| `contracts/workspace-provider.ts` usage | Read-only access to reality, honoured in all 12 GENESIS read sites; zero `persistence`/`better-sqlite3` imports anywhere in `src/genesis/`. The hardest boundary in the system, and it holds. |
| Rule-engine pattern | `candidate-rules`, `validation-rules`, `importance-rules`, `recall-rules`, `story-rules`, `understanding/rules`, `identity-rules`, `health rules`, reflection/reasoning/decision strategy registries — a consistent, testable, provenance-carrying pattern applied uniformly across 14 subsystems. |
| Evidence + confidence model | Identity, presence, companion state, habits, relationships and reflection all carry `evidence` trails and confidence values, with user corrections locking confidence to 1.00 while preserving the trace. This is unusually disciplined. |
| Immutable graph rebuild | `understandingEngine.rebuildGraph()` produces a new array and only notifies on change. |
| Noise resistance | `TRIVIAL_PHRASES` filtering requires both title and description to be trivial before discarding. |
| Strategy registries | `reasoning/registry.ts`, `decision/registry.ts`, `insights/reflection/engine/registry.ts`, `context/relevance/registry.ts` — pluggable, with default strategies, no hard-coded dispatch. |
| Identity type model | `identity/types.ts` (422 LOC) models interests, skills, goals, habits, preferences, values, relationships and personality with consistent lifecycle/confidence/evidence shapes. |
| Separation of derivation from rendering | Engines produce structured objects; `serializer.ts`/`insight-serializer.ts` render prose separately. Correct layering, even though the renderers themselves have hard-coded content (GEN-009). |

**The core problem in GENESIS is not its design — it is that the design is not connected to anything durable or to anything real.** The rule engines, evidence model and boundary discipline are assets worth preserving verbatim through any remediation of GEN-001 and GEN-002.
