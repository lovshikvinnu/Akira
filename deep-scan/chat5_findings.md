# AKIRA Deep Scan — Chat 5 Findings

Forensic integration audit of remaining GENESIS systems and end-to-end AKIRA
integration paths.

**Tree state at time of scan:** HEAD `a560475`, suite 1198 passing, tsc clean.
Note: branch history was rewritten during this phase. Commit hashes cited in
earlier verbal reports are stale, but the _content_ of those fixes is present in
the working tree (verified: `store-init` array guard, `companion_bootstrapped`,
knowledge `subjectKey`, hydration barrier all present).

**Method.** Every claim below was measured against the real store and real
services, not inferred from code reading. Probes are `tests/zz-c5-*.bench.ts`,
excluded from `vitest run` by config. No source files were modified.

---

## Scan coverage

| Subsystem                            | Status                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Memory lifecycle                     | Fully scanned                                                                                                               |
| Memory acquisition                   | Fully scanned                                                                                                               |
| Memory retention / decay             | Partially scanned — durable + runtime retention measured; confidence decay is Chat 3/4 territory and excluded               |
| Recall                               | Partially scanned — candidate bounds and prompt delivery measured; ranking quality not audited                              |
| Stories                              | Partially scanned — lifecycle and replay measured; story rule content not audited                                           |
| Understanding systems                | Fully scanned                                                                                                               |
| Identity systems                     | Partially scanned — evidence timestamps and observation lifecycle measured; confidence semantics excluded as completed work |
| Reality layer                        | Fully scanned                                                                                                               |
| Long-term cognitive state            | Fully scanned                                                                                                               |
| Cross-system context integration     | Fully scanned                                                                                                               |
| AKIRA OS ↔ GENESIS boundaries        | Fully scanned                                                                                                               |
| Search integration with GENESIS      | **Not applicable** — no integration exists (see inventory)                                                                  |
| End-to-end user journeys             | Fully scanned — restart, delete, session-review, chat-to-prompt                                                             |
| Orphaned/dead/duplicate architecture | Fully scanned                                                                                                               |

---

## Confirmed bugs

### C5-01 — A deleted project is still described to the model as actively being built

**Severity:** P0 — materially false claim about the user's current state.
**Affected system:** Reality layer (acquisition) + Understanding + prompt.

**Full production path:**

```
User deletes a project (projects page)
 ↓
akira.deleteProject() publishes Events.PROJECT_DELETED     (akira-store.ts:376)
 ↓
event-translation.ts has NO translator for *_DELETED
 ↓
SUPPORTED_PLATFORM_EVENT_TYPES derives from the translator table
 ↓
GENESIS never learns of the deletion
 ↓
projectRule still emits project:<id>, status "Active"
 ↓
serializeUnderstanding renders "The user is actively building X"
 ↓
promptBuilder → provider → model
```

**Real-world scenario:** A user abandons and deletes a project. On the next
message, AKIRA tells the model they are still working on it.

**Observed behaviour:** with `projects in store: 0`, the system instruction
carries:

```
Project
• Quantum compiler
The user is actively building Quantum compiler.
Confidence: High
```

**Expected behaviour:** the memory of having worked on it may survive (the
durable stream is append-only by design), but a present-tense, High-confidence
claim of _current_ activity must not.

**Root cause:** two defects compounding.

1. Deletion events are published but untranslatable, so GENESIS cannot know.
2. `Understanding.status` exists and is computed, but the serializer never reads
   it, so the sentence is unconditionally present-tense regardless of status.

**Evidence:** `tests/zz-c5-deleted-entity-claims.bench.ts`; `grep DELETED
src/genesis/events/event-translation.ts` returns nothing.

**Producer status:** live (`akira-store.ts:376,711` publish).
**Consumer status:** absent — no translator.
**Persistence status:** N/A; the stale claim is derived, not persisted.

**Reproduction:** create project → complete task → add notes → `deleteProject` →
rebuild context → inspect system instruction.

**Residual paths checked:** searched for an alternate deletion consumer
(none); checked whether the workspace store is consulted at render time (it is
not — understandings derive from the memory stream); confirmed no second
serializer.

**Suggested fix direction:** two separable repairs, deliberately not merged.
(a) The unconditional "actively" template — a Project understanding whose status
is not Active should not assert present activity, and `status` already exists
unused for exactly this. (b) Whether deletion should retract or merely age a
claim is a cognitive-policy decision. **Do not** delete underlying memories;
that trades a false claim for data loss.

---

### C5-02 — `Understanding.status` is computed on every rebuild and read by nobody

**Severity:** P2 alone; it is the enabling half of C5-01.
**Affected system:** Understanding.

**Full production path:**

```
determineStatus() → UnderstandingFragment.status
 ↓
merged across fragments (builder.ts:40, 69-72)
 ↓
Understanding.status
 ↓
(no reader)
```

**Observed behaviour:** Active / Completed / Archived is derived every rebuild
and discarded. `grep status src/genesis/understanding/serializer.ts` → empty.
`context-relevance-selector.ts` does not read it either.

**Root cause:** producer with no consumer.

**Evidence:** grep across `understanding/` and the selector; C5-01's probe shows
a stale claim surviving precisely because status is ignored.

**Producer status:** live. **Consumer status:** none. **Persistence:** derived.

**Residual paths checked:** searched every consumer of `Understanding` for a
`.status` read; checked the insight engine.

**Suggested fix direction:** it is the natural mechanism for C5-01 and should be
considered with it, not separately.

---

### C5-03 — A finished session's summary silently loses items as the user keeps working

**Severity:** P2 — misleads by omission on an audit surface.
**Affected system:** AKIRA OS ↔ GENESIS boundary (Session History UI).

**Full production path:**

```
User ends a focus session          → sessions[] with [startedAt, endedAt]
 ↓
User keeps working                 → new events → GENESIS rebuild
 ↓
storyService / identityService refresh updatedAt = now
 ↓
sessions.tsx activeOutcomes (~line 67) filters into the session window
 ↓
rendered as "what this focus cycle produced"
```

**Real-world scenario:** a user reviews a past session later in the day and sees
fewer outcomes than the session actually produced.

**Observed behaviour:** same finished session, queried twice —

```
Immediately after endSession:   stories 2 of 2   identity 1 of 1
After ONE unrelated later note: stories 1        identity 0   <-- empty though observations exist
events / candidates / promoted: unaffected
```

Stable thereafter — the loss occurs when an item is _touched_, not steadily.

**Expected behaviour:** a finished session's record should not change.

**Root cause:** semantic collapse between "created at" and "last touched",
inside one function. Three collections filter on immutable creation instants
(`e.timestamp`, `c.timestamp`, `m.timestamp`); two filter on mutation instants
(`s.updatedAt`, `o.updatedAt`). Stories and observations are derived state and
are rebuilt as events arrive.

**Evidence:** `tests/zz-c5-session-outcomes.bench.ts`.

**Producer status:** live. **Consumer status:** live and user-visible.
**Persistence status:** sessions persist; the derived state does not.

**Residual paths checked:** confirmed the three stable filters are unaffected
(so this is field choice, not windowing); confirmed `createdAt` exists on both
Story and IdentityObservation as an alternative.

**Suggested fix direction:** filter on a creation instant, consistent with the
other three. Whether a session should claim artifacts it _created_ versus
_touched_ is a small semantic call worth confirming. **Do not** widen the
window — that would pull in unrelated artifacts.

---

### C5-04 — GENESIS observes 9 of 98 platform events; ordinary user activity is invisible to cognition

**Severity:** P1 — a major intended capability (memory acquisition) is narrower
than the architecture implies.
**Affected system:** Reality layer / memory acquisition.

**Full production path:**

```
User action → akira-store publishes an Events.* on the platform bus
 ↓
reality-adapter → event-translation.TRANSLATORS
 ↓
only 9 event types have a translator
 ↓
SUPPORTED_PLATFORM_EVENT_TYPES derives from that table
 ↓
89 event types can never become a MemoryEvent
```

**Observed behaviour:** 98 events declared in `contracts/events.ts`, 9
translators registered. Verified emitted-in-production but unobserved:

| Event                                               | Emitted | Reaches GENESIS |
| --------------------------------------------------- | ------- | --------------- |
| `TASK_CREATED` / `UPDATED` / `DELETED` / `REOPENED` | yes     | no              |
| `SESSION_STARTED` / `SESSION_ENDED`                 | yes     | no              |
| `VAULT_FILE_UPLOADED` / `DELETED`                   | yes     | no              |
| `VAULT_FOLDER_CREATED`                              | yes     | no              |
| `SEARCH_EXECUTED`                                   | yes     | no              |
| `SETTINGS_UPDATED`                                  | yes     | no              |

Only `TASK_COMPLETED` crosses from the task lifecycle. Starting a focus session,
uploading a document, and deleting a task are all invisible to memory.

**Root cause:** the translator table is the sole gate, and it has grown far more
slowly than the event vocabulary.

**Important qualification — not all 89 are gaps.** Roughly 30 `IDENTITY_*` are
emitted _by_ GENESIS internals, and ~20 `PLAN_*`/`MILESTONE_*`/`PLANNING_*` come
from orphaned `genesis/planning`. Those are moot. `PRESENCE_UPDATED` is
deliberately excluded and documented. The genuine gap is the 11 above.

**Evidence:** set difference between `contracts/events.ts` keys and
`TRANSLATORS` keys; per-event emission grep.

**Producer status:** live for all 11. **Consumer status:** absent.

**Residual paths checked:** confirmed no second ingestion route into GENESIS
(no direct `eventService.record` from vault/task/session paths); confirmed
`SUPPORTED_PLATFORM_EVENT_TYPES` is derived from the table rather than a second
list that could disagree.

**Suggested fix direction:** this is a product decision, not a mechanical one —
which of these _should_ be remembered is a cognitive-policy question, and adding
translators indiscriminately would repeat the `chat_message` volume problem.
Recommend deciding per event, starting with `SESSION_STARTED`/`SESSION_ENDED`
(cheap, low volume, high signal about focus).

---

## End-to-end failures

### The delete journey — every subsystem behaves correctly and the journey still fails

```
User creates project            ✓ event → memory → story → understanding
User works on it                ✓ task completion recorded
User writes notes               ✓ knowledge understanding aggregates by subject
User deletes the project        ✓ row removed, PROJECT_DELETED published
GENESIS learns of the deletion  ✗ no translator
Prompt stops claiming it        ✗ "actively building", High confidence
```

No individual component is broken. `akira-store` correctly publishes.
`event-translation` correctly translates everything it knows about.
`projectRule` correctly derives from memories. `serializeUnderstanding`
correctly renders a Project understanding. The failure lives entirely in the
seam — exactly the class this audit exists to catch.

---

## Dead / duplicate / orphaned architecture

Liveness measured by production importer count, with transitive reachability
checked (a subsystem imported only by a dead subsystem is dead).

| System                                          | Real producer                                   | Real consumer                                            | Unique production capability                                   | Classification          | Recommendation                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genesis/planning` (38 files, 3577 lines)       | none                                            | none (tests only)                                        | none today — implements Plan→Milestone→Task→Dependency→Blocker | **ORPHANED**            | Decision E. Coherent and tested but unwired; no ADR owns it. Overlaps the goal hierarchy — do not classify without that decision.                    |
| `runtime` (37 files)                            | none                                            | none                                                     | none                                                           | **ORPHANED**            | Subject of ADR-016/017, so architecturally intended. Record status against those ADRs; do not delete.                                                |
| `compatibility` (16 files)                      | none                                            | none                                                     | none                                                           | **ORPHANED**            | Same as runtime (ADR-016/017).                                                                                                                       |
| `genesis/reasoning` (8 files)                   | none                                            | only `genesis/decision`                                  | none                                                           | **DEAD** (transitively) | Its sole consumer is itself dead. Naive importer counts report this LIVE — reachability walk required.                                               |
| `genesis/decision` (4 files)                    | none                                            | none (tests only)                                        | none                                                           | **DEAD**                | —                                                                                                                                                    |
| `workers` (1 file)                              | none                                            | none                                                     | none                                                           | **ORPHANED**            | Low stakes.                                                                                                                                          |
| `hypothesesService`                             | `proposeHypothesis` has zero production callers | `brain.tsx:1361`, `chat.tsx:889`, `context-rules.ts:313` | none — cache is permanently `[]`                               | **ORPHANED**            | Three live consumers of a dead producer. Renders "Onboarding Hypotheses (0)" forever; handles empty honestly.                                        |
| `intent-resolver.generateClarificationResponse` | n/a                                             | zero callers                                             | none                                                           | **DEAD**                | A local templated conversational path that nothing reaches. Also carries hardcoded `"pilot"` special-casing duplicated in `prompt-builder.ts:25-30`. |
| Search ↔ GENESIS                                | n/a                                             | n/a                                                      | n/a                                                            | **NO INTEGRATION**      | `src/akira-os/search/` contains zero references to GENESIS. Not a defect — an absence. Listed so it is not mistaken for a broken link.               |

Total disconnected from production: **~104 of 586 source files (18%)**. This
materially changes coverage denominators — see inventory.

---

## Suspected findings (incomplete evidence)

1. **Three further Brain Inspector panels may be unpopulatable.** `activeSession`,
   `logs` and `importantConstraints` were all empty after a realistic session.
   _Not proven_ — my fixture never started a work session, never ran in-browser
   (the logger may only capture there), and declared no Value observation (which
   is what `extractConstraints` filters for). Needs a fixture that exercises each
   before any claim.

2. **`ResolvedContext.currentPriorities` and `currentFocus` are computed but
   never serialized to the prompt.** Confirmed the prompt serializer never
   references them. _Not proven dead_ — I have not checked for a UI consumer.

3. **Hardcoded `confidence: 1.0` at `initiative/rules.ts:139` and
   `insights/reflection/rules.ts:141`.** These are literal certainty fields, not
   accumulator initialisers, in live code. _Not traced to a consumer._ Candidate
   P0 if either reaches the prompt as a claim about the user. Adjacent to Chat
   3/4's confidence territory — flagged, deliberately not pursued.

4. **Note-deletion behaviour is untested.** C5-01 proves the project case. My
   probe deleted 1 of 3 identically-titled notes, so the surviving Knowledge
   understanding was legitimately correct. Deleting _all_ notes on a subject is
   unmeasured.

---

## Healthy paths explicitly proven

These were traced end-to-end and measured, not assumed.

1. **Restart / reconstruction across the whole cognitive stack.** After
   hydrate + clear-then-replay, all nine derived structures are equivalent —
   `store.memories`, candidates, memories, stories, memory-relationships,
   identity observations, importance, recall candidates, understandings — with
   zero content lost and zero gained. Story titles, observation values and
   understanding keys all match by identity, not just by count. **The
   `docs/audits/05` claim that replay would duplicate stories/insights/habits is
   stale**: five services now subscribe to `memoryService.subscribeClear`, not
   one. Probe: `tests/zz-c5-restart-journey.bench.ts`.

2. **Knowledge understanding subject aggregation and its survival across
   replay.** Notes on one subject aggregate into one fragment; confidence rises
   with repeated engagement; the subject rides on the durable event so replay
   reproduces it exactly. Covered by `tests/genesis-knowledge-subject.test.ts`.

3. **Persisted-blob shape validation.** A wrongly-typed `chat` / `streaks` /
   `genesis_memories` is refused at load rather than silently overwriting
   history. Covered by `tests/genesis-persisted-shape-validation.test.ts`.

4. **The pre-hydration durable-write window is empty.** Running `__root.tsx`'s
   entire second effect verbatim against an unhydrated store leaves disk
   untouched and registers no health component, with a deliberate durable event
   in the same state proving the probe can see the path.

---

## Final territory inventory

| System                           | Scan status | Bugs | Producer | Consumer      | Architecture status       | Notes                                                           |
| -------------------------------- | ----------- | ---: | -------- | ------------- | ------------------------- | --------------------------------------------------------------- |
| Memory lifecycle                 | Full        |    0 | live     | live          | KEEP                      | Replay-equivalent; retention bounded per durability class       |
| Memory acquisition               | Full        |    1 | live     | **narrow**    | KEEP (gap)                | C5-04: 9 of 98 events observed                                  |
| Memory retention / decay         | Partial     |    0 | live     | live          | KEEP                      | Durable + runtime retention verified; confidence decay excluded |
| Recall                           | Partial     |    0 | live     | live          | KEEP                      | Reaches the prompt; ranking quality not audited                 |
| Stories                          | Partial     |    0 | live     | live          | KEEP                      | Survives replay by identity                                     |
| Understanding                    | Full        |    2 | live     | live          | KEEP                      | C5-01, C5-02                                                    |
| Identity                         | Partial     |    0 | live     | live          | KEEP                      | Evidence timestamps verified sound incl. replay                 |
| Reality layer                    | Full        |    1 | live     | **narrow**    | KEEP (gap)                | C5-04 root; deletions untranslatable (C5-01)                    |
| Long-term cognitive state        | Full        |    0 | live     | live          | **KEEP — proven healthy** | Full restart equivalence                                        |
| Cross-system context integration | Full        |    1 | live     | live          | KEEP                      | C5-03 session attribution                                       |
| AKIRA OS ↔ GENESIS boundary      | Full        |    1 | live     | **narrow**    | KEEP (gap)                | Translator table is the sole gate                               |
| Search ↔ GENESIS                 | Full        |    0 | n/a      | n/a           | **NO INTEGRATION**        | Absence, not breakage                                           |
| `genesis/planning`               | Full        |    0 | none     | none          | **ORPHANED**              | Defer to Decision E                                             |
| `genesis/reasoning`              | Full        |    0 | none     | dead consumer | **DEAD**                  | Transitive                                                      |
| `genesis/decision`               | Full        |    0 | none     | none          | **DEAD**                  | —                                                               |
| `runtime`                        | Full        |    0 | none     | none          | **ORPHANED**              | ADR-016/017                                                     |
| `compatibility`                  | Full        |    0 | none     | none          | **ORPHANED**              | ADR-016/017                                                     |
| `hypotheses`                     | Full        |    0 | none     | 3 live        | **ORPHANED**              | Dead producer, live consumers                                   |

---

## What I deliberately did not do

- Did not modify any source file. Probes only, all `tests/zz-c5-*.bench.ts`.
- Did not reopen the relationship engine, confidence architecture, deleted Goal
  and Knowledge engines, or the persistence ordering race.
- Did not classify `genesis/planning` as removable — it overlaps the goal
  hierarchy and belongs to Decision E.
- Did not propose integrating any orphaned subsystem. A coherent subsystem with
  no purpose is still unnecessary code, and that call is not mine.
- Did not pursue the two hardcoded `confidence: 1.0` sites, which sit adjacent
  to another chat's territory.

---

# HARDENING PHASE — Chat 5

Tree: HEAD `cfb8a70`, suite 1213 passing, tsc clean.

## Fixed

### Session outcomes survive a restart — `cfb8a70`
`selectSessionOutcomes` attributed stories and identity observations by
`createdAt`, which had already replaced `updatedAt`. Both are wrong for derived
state: it is re-derived on every startup and the rebuild re-stamps it.

    immediately after the session   createdAt-in-window  stories 1/2  identity 1/1
    after later unrelated activity  createdAt-in-window  stories 1/2  identity 1/2
    after a restart                 createdAt-in-window  stories 0/2  identity 0/2

Now dated by the durable evidence each artifact cites (`relatedMemoryIds` /
`supportingMemoryIds`), whose memory `timestamp` replay reproduces exactly:
2/2 and 2/2 in all three conditions. Control: reverting the two filters fails
only the restart case.

Fixture correction: `genesis-session-history-attribution.test.ts` kept every
assertion; its hand-built stories omitted the evidence links the real types
require, which was the one production variable attribution turns on.

## Verified already fixed (no action)

- **Deleted project → stale active claim.** Translators for `PROJECT_DELETED` /
  `NOTE_DELETED` exist; the serializer consumes `u.status`. Prompt now reads
  "is archived and no longer active. Status: Archived".
- **`Understanding.status`** now has an effective consumer (`serializer.ts:120,180`).
- **Note deletion (area 6) is healthy.** 3 notes → `status=Active`, "actively
  learning". Delete 2 → still Active (correct, one remains). Delete the last →
  `status=Archived`, prompt says "archived and no longer active", while 7 durable
  memories and 7 recall candidates keep the history. Historical fact preserved,
  current-state claim retracted — exactly the required distinction.

## Area 4 — restart reconstruction

| Subsystem | Durable source | Rebuilds? | Classification |
| --- | --- | --- | --- |
| Memories / candidates / stories / identity / importance / recall / understandings | `genesis_memories` | Yes — 9/9 equivalent, content identical | **KEEP + REBUILD (proven healthy)** |
| Contact relationships | chat, persisted in `settings.chat` | **No** — 1 before, 0 after engine re-init | **DECISION** |
| Habits | workspace events | Not exercised — 0 throughout my fixture | **UNPROVEN** |
| Reflection | — | `getContext()` returned n/a in fixture | **UNPROVEN** |

Contact relationships are **session-scoped by an explicit design choice**:
`relationships/service.ts:70,72` resets the list and sets
`lastProcessedChatTime = Date.now()` with the comment "only process new chat
messages during this session". The durable chat is available, so KEEP + REBUILD
is mechanically possible. Whether "who the user knows" should reset daily is a
product decision, not a defect — recorded, not fixed.

## Area 7 — currentPriorities / currentFocus

| Field | Consumers | Classification |
| --- | --- | --- |
| `ResolvedContext.currentFocus` | `initiative/rules.ts:56` gates an initiative decision on it | **LIVE AND NEEDED** |
| `CompanionState.currentFocus` | `prompt-builder.ts:249` renders "Active Focus" | **LIVE** (a different object; not the ResolvedContext field) |
| `ResolvedContext.currentPriorities` | filtered by `context-relevance-selector.ts:73`, then read by nothing | **DEAD** — a transformation consumer but no terminal consumer; the selector's filtering of it is dead work |

## Area 8 — confidence literals

`initiative/rules.ts` `applyUserInitiativeCorrection` sets `confidence: 1.0`
when the **user explicitly overrides** a decision outcome. That is source
certainty about a stated fact, not manufactured evidence confidence, and matches
the architecture's separation. **Not a bug.** Separately, it carries the dormant
`applyUserCorrection` shape — no production caller found.

## Still open

- Area 3 (event ingestion policy) — classification below, no translators added.
- Area 9 (Brain Inspector `activeSession` / `logs` / `importantConstraints`) —
  needs fixtures that exercise each; not classified.
- Habits and reflection restart behaviour — unproven either way.
