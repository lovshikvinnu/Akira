# AKIRA Deep Scan — Chat 6: Production-Readiness Verification

Question: _Can AKIRA's current production path survive real usage, restart,
persistence, growing memory, and cross-system state changes without losing or
fabricating state?_

**Answer: No — not yet.** Restart reconstruction of cognition is sound, but the
project-deletion seam loses durable session data and leaves present-tense claims
in the prompt. Four confirmed defects below; the worst one wedges session
persistence permanently.

Tree: HEAD `88f78dd`. `vitest run` 122 files / 1218 tests passing, `tsc` clean.
Scope: unresolved items from Chats 3–5 only. No source files modified. Probes are
`tests/zz-c6-*.bench.ts`, excluded from `vitest run`; run with
`npx vitest bench --run --config vitest.bench.config.ts <file>`.

---

## Confirmed failures

### C6-01 — Deleting a project during a running session wedges session persistence (P0, data loss)

```
startSession(P) -> DB settings.active_session = {projectId: P}
deleteProject(P) -> store: activeSession = null
                    DB:    projects row deleted; active_session untouched
reload           -> getInitialState restores active_session -> ghost session for deleted P
startSession(Q)  -> SqliteSessionRepository.start() calls end() first
                    end() INSERTs sessions(project_id = P) -> FOREIGN KEY constraint failed
                    transaction rolls back; active_session never cleared
every later start/end -> same failure, forever
```

Measured (`zz-c6-project-delete-sessions.bench.ts`, case B):

```
after delete   store activeSession null      db activeSession {projectId: P}
after reload   store activeSession {ghost}
start+end on a surviving project:
   store sessions ['next', 'running']        db sessions []
   write errors  sessions.start / sessions.end: FOREIGN KEY constraint failed
```

The user sees their sessions recorded; none reach disk; the next restart erases
them. Self-perpetuating — no user action recovers it. Failure is visible only in
the console and the health registry.

Fix direction: `projectsService.delete` should clear `active_session` when it
names the deleted project, in the same transaction — mirroring what the store
already does. Whether the running session is discarded (store's current
behaviour) or ended-and-recorded first is a product call.

### C6-02 — Companion State never retracts a present-tense claim (P1, fabrication)

`state/service.ts` `subscribeToStore` only moves _toward_ a project/focus:
`if (lastProjId && ...)` skips `null`, and nothing ever unsets
`currentFocus = "Building"`. `prompt-builder.ts:249-251` renders both
unconditionally.

Measured (`zz-c6-companion-state-staleness.bench.ts`), real selector →
prompt-builder chain, workspace question:

```
after endSession                 focus=Building project=Only Project  store activeSession=no
after deleting the only project  focus=Building project=Only Project  store projects=0
system prompt: "• Active Focus: Building" / "• Active Project: Only Project"
```

Same class as C5-01, through a channel C5's serializer fix does not cover.
Chat 4's cache check missed it because its fixture kept a surviving project
(`lastProjectId` non-null). Lasts until process restart.

### C6-03 — A deleted project's past sessions: kept in the store, cascaded away on disk (P2, loss on restart)

`deleteProject` keeps sessions (re-points to `projectId: ""`); `schema.sql`
`sessions.project_id ... ON DELETE CASCADE` erases them.

```
before delete  store 1  db 1
after delete   store 1  db 0   -> gone at next restart
```

The two layers encode opposite policies. Which is right (keep history vs. delete
with project) is a product decision; the divergence is the bug. Note tasks and
notes use `SET NULL`, i.e. keep — sessions are the odd one out.

### C6-04 — Every boot fabricates one habit; no real habit survives restart (P3)

`habitService.initialize()` runs before hydration (`lastProjectId = null`), so
hydration's `lastProjectId` looks like a user focus switch.

```
boot 1..3: habits ['Workspace Focus Switch/BehaviorObserved/proj-returning']
```

Reaches the prompt's Habits block for workspace queries (low confidence).
Chat 4's restart finding for habits stands: state resets each boot.

---

## Risk, not failure

**Chat blob grows without bound.** `addChatMessage` rewrites the full `chat`
array into one settings row on every message; no cap exists. Bytes written per
message = total history size. Not loss or fabrication; degrades with use.
No timing claimed (see CLAUDE.md §5).

---

## Closed since Chats 3–5

| Item                                                        | Status               | Evidence                                                                                                                                                 |
| ----------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task reorder lost on reload (Chat 3 #1)                     | Fixed                | `257789f`, `tests/task-order-persistence.test.ts`                                                                                                        |
| Contacts lost on restart (Chat 4 #1, contacts half)         | Fixed                | `88f78dd`, `tests/genesis-context-restart.test.ts`                                                                                                       |
| Timeline dev seeding in production (Chat 3 suspected)       | **Not a bug**        | Built `.output/` server chunk and client bundle both eliminate the guarded call; `seedDevelopmentEvents` survives only as an uncalled definition         |
| Reflection restart (Chat 4, Chat 5 unproven)                | **Inert**            | No production caller produces a report; only `initialize`/`getContext`/`shutdown` are called. Nothing to lose, nothing fabricated                        |
| Services initialized against empty store (Chat 4 suspected) | Resolved per service | Companion state re-syncs on hydration (but see C6-02); habits do not (C6-04); relationships fixed                                                        |
| 74 `FOREIGN KEY` lines in green suite stderr                | **Fixture noise**    | 73 from `tests/genesis-persistence.test.ts`, which adds tasks under project ids it never creates; 1 deliberate in `genesis-persistence-ordering.test.ts` |

## Healthy, re-confirmed

- Cognition restart equivalence (Chat 5 area 4) — unchanged at this HEAD.
- GENESIS durable stream retention bounded (`genesis-persistence.test.ts`
  "bounds the durable stream itself").
- Deleted project/note understanding retracted (Chat 5 hardening).

## Not investigated (outside the question)

- Brain Inspector empty panels (Chat 5 area 9) — UI population, not state integrity.
- Event ingestion policy (C5-04) — product decision, no loss/fabrication.
- Presence as an independent subsystem beyond its role in C6-02.

---

# HARDENING — Chat 6

## Fixed

**C6-01.** `SqliteProjectRepository.delete` now discards an `active_session`
naming the project, in the same transaction as the delete (the store's existing
semantics). `SqliteSessionRepository.end()` discards a session whose project no
longer exists instead of failing its FK insert — this recovers databases the
bug already wedged. Pinned by `tests/session-project-deletion.test.ts` (4).

**C6-02.** Companion State's store subscriber is driven by workspace
transitions in both directions: no active project → `activeProject` cleared;
session ended → `currentFocus` "Building" → "Unknown". Transition-driven also
stops an unrelated store change re-asserting a fact over `correctState`.
Pinned by `tests/companion-state-retraction.test.ts` (5), including the real
selector → prompt-builder chain.

Controls: reverting each of the three source changes fails exactly its tests
(2 / 1 / 3); all 9 pass with the fixes in.

Probes after the fix:

```
C6-01  db activeSession null after delete; after reload null;
       store ['next'] = db ['next']; write errors []
C6-02  after endSession focus=Unknown; after deleting the only project
       project=-; prompt: ['• Active Focus: Unknown']
C6-03  store 1 / db 0 — unchanged, held for the retention decision
C6-04  one fabricated habit per boot — unchanged, next pass
```

Suite 124 files / 1227 tests; `tsc`, `verify:observability`,
`validate:architecture` (361/361) pass. `npm run lint` fails on this tree
before and after the change: CRLF working copies of 86 files plus prettier
drift in untouched files. The changed files lint clean.

## Held

- **C6-03** — needs a decision on whether a deleted project's session history
  is kept (schema change away from CASCADE) or removed (store matches DB).
- **C6-04** — next hardening pass.

---

# C6-03 — Session history retention (decision: preserve 30 days)

## Model

| Piece                                                                                                       | Where                                                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `sessions.project_id` nullable, `ON DELETE SET NULL` (was `NOT NULL ... CASCADE`)                           | `schema.sql`; existing DBs rebuilt in `initializer.ts` |
| `sessions.project_deleted_at` — retention start                                                             | same                                                   |
| Stamped in the project-delete transaction; `updated_at` untouched                                           | `SqliteProjectRepository.delete`                       |
| `SESSION_HISTORY_RETENTION_DAYS = 30`; `getAll()` omits sessions past it                                    | `SqliteSessionRepository`                              |
| Store mirrors it (`projectId: ""`, `projectDeletedAt`) so a session reads the same before and after restart | `akira-store.deleteProject`, `WorkSession`             |

No purge exists. Expired rows stay on disk, out of every read, and stay in the
search index until one does — spun off as a separate task.

## Found while implementing

- **Migration would have broken startup on every existing database.**
  `trg_projects_delete` (on `projects`) names `sessions`; a modern `ALTER TABLE
RENAME` re-validates it between the DROP and the RENAME and fails with "no
  such table: main.sessions". The rebuild runs under `legacy_alter_table`.
  Caught only by the migration test.
- **Reset relied on the cascade.** `reset.ts` documented sessions as untouched,
  but `DELETE FROM projects` always cascaded onto them, and `seed()` empties
  them in the store. Kept the behaviour users have had — reset now deletes
  sessions explicitly — and corrected the comment. Reset also left
  `active_session` behind (the C6-01 ghost via a second path); now cleared.
- **Search.** Retained sessions stay searchable: the FK nulls `project_id`
  before `trg_projects_delete` runs, so its subquery no longer matches. Pinned
  by a test. `search.test.ts` asserted the old CASCADE outcome and was updated
  to the policy: the project's entry is removed; the session's remains because
  its row does.

## Verification

`tests/session-history-retention.test.ts` (12): deletion, retention stamp,
other projects untouched, search, restart equivalence, no resurrection of the
deleted project as active state, no FK failures after restart, the boundary
(30 d − 1 ms kept, 30 d omitted, live-project sessions unaffected at 365 d),
and the legacy-schema migration (rows, indexes and triggers preserved, FKs
back on). Plus a reset case in `genesis-reset-local-data.test.ts`.

Controls, each reverted alone: schema back to CASCADE → 6 fail; no retention
filter → 2; no stamp → 4; no `legacy_alter_table` → 2; reset without
`DELETE FROM sessions` → 1.

Suite 125 files / 1240 tests; `tsc`, `verify:observability`,
`validate:architecture` 361/361. Probe C6-03 now: store 1 / db 1, searchable 1.
C6-04 unchanged (held).

---

# C6-04 — Boot-fabricated habit — fixed `f26e50b`

`__root.tsx` initialized the habit engine against the unhydrated seed
(`lastProjectId: null`); hydration's single emission then read as a focus
switch. The engine now takes pre-hydration state and the hydrating emission
as its baseline, keyed on the store's one-way `hydrated` flag exposed through
`WorkspaceProvider.isHydrated?()`. Genuine switches are unaffected. Pinned by
`tests/habit-boot-restoration.test.ts`, which boots each process in a fresh
module graph so `hydrated` starts false as at a real start.

Habits remain session-scoped; whether they should persist is a separate
question, not part of this fix.

## Probes

The `tests/zz-c6-*.bench.ts` probes cited above were forensic and have been
removed. Each property they measured is pinned by a committed test with a
negative control:

| Probe                             | Permanent test                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `zz-c6-project-delete-sessions`   | `session-project-deletion.test.ts`, `session-history-retention.test.ts`                                            |
| `zz-c6-companion-state-staleness` | `companion-state-retraction.test.ts`                                                                               |
| `zz-c6-habit-boot`                | `habit-boot-restoration.test.ts` (the probe's boots 2–3 reused one module graph and were never a faithful restart) |
