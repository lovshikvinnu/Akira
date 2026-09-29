# AKIRA Deep Scan — Chat 3 Findings

Territory: AKIRA OS / product / workspace systems.
HEAD at scan start: `a560475`. Working tree clean throughout (no concurrent edits).

---

## Scan coverage

| Area                                                                                               | Status                | How it was covered                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace state management (`src/persistence/akira-store.ts`)                                      | **Fully scanned**     | All 42 store actions audited mechanically for `set()` / `publish()` / `persist()`; each anomaly traced to a production caller               |
| Tasks (store + `routes/tasks.tsx`)                                                                 | **Fully scanned**     | Create/update/toggle/delete/reorder traced store → persist → repository → hydration; reorder loss reproduced                                |
| Projects (store + `routes/projects.tsx`)                                                           | **Fully scanned**     | add/update/delete/touch all persist and publish; verified in the action audit                                                               |
| Search (`akira-os/search`, `SqliteSearchRepository`, FTS triggers, `routes/search.tsx`)            | **Fully scanned**     | Trigger coverage compared against UI scope enum; end-to-end retrieval reproduced for project/note/task                                      |
| Timeline (`akira-os/timeline`, `timeline-subscriber`, `routes/timeline.tsx`)                       | **Fully scanned**     | Producer → repository → route traced; dev-seeding guard examined                                                                            |
| Tools / packages (`akira-os/tools/registry.ts`, `routes/tools*.tsx`)                               | **Fully scanned**     | Registry entries compared against existing routes; `coming-soon` gating verified                                                            |
| Vault upload path (`hooks/useUploadQueue.ts` → `addUploadedFile`)                                  | **Fully scanned**     | Traced to `uploadMockFileServer`; confirmed server-side persistence precedes the store write                                                |
| Notes (store actions + FTS)                                                                        | **Fully scanned**     | All note mutations persist; note indexing verified by live search                                                                           |
| Vault files/folders/tags (store actions)                                                           | **Fully scanned** | All mutating actions persist; trash lifecycle traced — soft-delete via `deletedAt`, nulled on restore, row removed on permanent delete                      |
| Sessions (`akira-os/sessions`, `routes/sessions.tsx`)                                              | **Partially scanned** | Store actions persist; session attribution audited previously (`c7ae7d4`). Session start/end lifecycle across restart not re-exercised here |
| Presence / settings                                                                                | **Partially scanned** | Reached only through the store-action audit; not independently traced                                                                       |
| UI ↔ store synchronization                                                                         | **Fully scanned** | All 19 routes checked: 11 use the subscribing `useAkira` hook; the 2 reading `getState()` directly were each traced to a live refresh path                                              |
| GENESIS internals, persistence FK race, confidence/certainty, relationship engine, removed engines | **Not applicable**    | Excluded by brief                                                                                                                           |

---

## Confirmed bugs

### 1. Task reordering is silently discarded

**Severity:** Medium
**Status:** Confirmed (reproduced)
**Affected system:** Tasks — store ↔ persistence ↔ UI

**Production path:**

```text
routes/tasks.tsx:110  (drag-and-drop handler)
    ↓
akira.reorderTasks(ids)                 src/persistence/akira-store.ts:660
    ↓
set() reorders the in-memory tasks array only
    ↓
(no persist(), no publish())
    ↓
SqliteTaskRepository:48  SELECT * FROM tasks ORDER BY created_at ASC
    ↓
hydration returns creation order
```

**Scenario:** A user drags a task to reorder their list, sees the new order, and reloads the app.

**Observed behavior:** Reproduced against a real store + SQLite:

```text
store order before : A first, B second, C third
store order after  : C third, A first, B second
database order     : A first, B second, C third
```

The reorder is visible until reload, then gone.

**Expected behavior:** Either the order survives a reload, or the UI does not offer drag-to-reorder.

**Root cause:** Two layers, and the second is the real one. `reorderTasks` is the only mutating store action besides the dead `addTask` that never calls `persist()` — but even if it did, **`Task` has no order/position field and the `tasks` table has no ordering column**. Ordering is represented purely as array position in memory, and the repository imposes `ORDER BY created_at ASC` on read. There is no storage model for user-defined order at all.

**Evidence:**

- `src/persistence/akira-store.ts:660-666` — `reorderTasks` mutates `s.tasks` and returns; no `persist`, no `publish`
- `src/routes/tasks.tsx:100-112` — live drag handler, the only caller
- `src/persistence/repositories/SqliteTaskRepository.ts:48` — `ORDER BY created_at ASC`
- `src/shared/types/store-types.ts` — `Task` has no `order`/`position`/`sort` field

**Residual paths checked:**

- Whether `addTaskDetails` or another action persists order → no; none writes an ordering value
- Whether an ordering column exists under another name (`position`, `sort`, `rank`) → none in the type or schema
- Whether the UI re-sorts client-side on load from some stored preference → no such preference exists
- Whether `reorderTasks` has another caller that persists → only `tasks.tsx:110`

**Suggested fix direction:** This is a product decision before it is a code fix. Either add a persisted ordering column (and write it from `reorderTasks`), or remove the drag affordance. Do not "fix" it by adding `persist()` alone — that would persist the task rows without their order and change nothing.

---

## Suspected bugs requiring later investigation

### Timeline development seeding may reach a packaged desktop build

**Affected system:** Timeline
**Evidence gathered:** `akira-os/timeline/service.ts:56` guards `seedDevelopmentEvents()` with
`process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test"`. Seeding inserts fabricated events (e.g. `MISSION_COMPLETED "Complete design constitution check"`, notes dated 5–8 days ago) directly into `timeline_events`, which the timeline route renders as the user's real history and which the FTS triggers index as searchable `timeline` entities.

**Why it is not confirmed:** `timelineService.initialize()` runs from `__root.tsx`, which executes on the server runtime as well as the client. `vite build` inlines `NODE_ENV` for the client bundle, but the server-side value is whatever the host process exports. AKIRA is a desktop app, and I could not verify from this repository how the shipped desktop build launches its server process.

**Exact missing evidence:** the desktop packaging/launch configuration, and whether it exports `NODE_ENV=production`. If it does not, first-run users would see fabricated history as their own.

**Note:** `seedDevelopmentEvents` is idempotent (`if (count > 0) return`), so the blast radius is first run only.

---

## Dead / duplicate / orphaned architecture

| System                             | Production producer                              | Production consumer        | Unique capability | Overlap                                                                   | Recommendation                                                                                                              |
| ---------------------------------- | ------------------------------------------------ | -------------------------- | ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `akira.addTask(title)`             | none — no caller anywhere outside tests          | n/a                        | none              | Fully duplicated by `addTaskDetails`, which persists and is the live path | **REMOVE**                                                                                                                  |
| `akira.updateTask(id, patch)`      | none — no caller anywhere outside tests          | n/a                        | none              | Fully duplicated by `updateTaskDetails` (`routes/tasks.tsx:411`)          | **REMOVE**                                                                                                                  |
| `Events.TASK_UPDATED`              | only the dead `updateTask`                       | **no subscriber anywhere** | none              | Published into a void                                                     | **REMOVE** with `updateTask`                                                                                                |
| Timeline `seedDevelopmentEvents()` | `timelineService.initialize()` in non-production | timeline route + FTS index | dev fixtures      | —                                                                         | **DECISION** — see suspected bug above; if kept, the guard should be explicit rather than inherited from ambient `NODE_ENV` |

Note on `addTask` vs `updateTask`: these are not merely unused, they are the _event-publishing_ variants, while the live paths (`addTaskDetails`, `updateTaskDetails`) are the silent ones. That inversion is worth knowing before anyone "fixes" the live actions by adding events — `TASK_UPDATED` has no consumer, so publishing it would achieve nothing today.

---

## Stale or weak tests and validators

Nothing conclusive found in my territory during this pass. The store-action audit was done against source rather than tests, so test quality here has not been systematically assessed. Flagged as **not covered** rather than clean.

One observation worth recording: there is no test anywhere that asserts task ordering survives a reload — which is why bug #1 has been invisible.

---

## Healthy systems explicitly verified

| System                           | How it was proven healthy                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Search (FTS)**                 | Trigger set covers exactly the five entity types the UI offers (`note`, `project`, `session`, `task`, `timeline`); the search route's Zod enum matches. Vault files are unindexed **and** deliberately absent from the UI scope — consistent, not a gap. Verified end-to-end against a live DB: `"Kitchen" → project`, `"grout" → note`, `"second" → task` |
| **Store persistence coverage**   | 37 of the 40 mutating store actions call `persist()`. The three exceptions were each traced individually; two are dead code, one is bug #1                                                                                                                                                                                                                 |
| **Vault upload**                 | `addUploadedFile` does not persist _by design_ — `useUploadQueue.ts:22` awaits `uploadMockFileServer`, a server fn that writes the file, then syncs the store with the returned row. Store is a cache of an already-durable write                                                                                                                          |
| **Tools registry**               | `analytics` and `genesis` name routes that do not exist, but `tools.index.tsx:76` returns before `navigate()` for `status: "coming-soon"` and renders a "Coming Soon" badge. Gated, not broken                                                                                                                                                             |
| **Projects lifecycle**           | `addProject`, `updateProject`, `deleteProject`, `touchProject` all update state, publish an event, and persist                                                                                                                                                                                                                                             |
| **`brain.tsx` live refresh** | Reads `akira.getState()` without `useAkira`, which looks like a stale-render bug. It is not: `eventService.onRecord` (line 127) pushes each new event into state, and nine further service subscriptions drive the other panels. Traced before filing — this was a candidate finding that did not survive verification |
| **Vault trash lifecycle** | `deleteFile` soft-deletes via `deletedAt`, `restoreFile` nulls it, `permanentDeleteFile` removes the row; all three persist. Coherent model, no divergence between store and DB |
| **Timeline producer → consumer** | `instrumentation/subscribers/timeline-subscriber.ts:44` inserts from the event bus; `routes/timeline.tsx:89` reads via `timelineService.getEvents`; lifecycle managed in `__root.tsx:256/267`. Chain is live                                                                                                                                               |

---

## Final inventory

| System                       | Scan status       |               Bugs found | Architecture status   | Notes                                                                        |
| ---------------------------- | ----------------- | -----------------------: | --------------------- | ---------------------------------------------------------------------------- |
| Workspace store (42 actions) | Fully scanned     |                        1 | KEEP                  | Systematic persist/publish audit; 3 anomalies, all traced                    |
| Tasks                        | Fully scanned     |                        1 | KEEP + 2 dead actions | Reorder loss reproduced; `addTask`/`updateTask` dead                         |
| Projects                     | Fully scanned     |                        0 | KEEP                  | All four actions complete                                                    |
| Search / FTS                 | Fully scanned     |                        0 | KEEP                  | Verified end-to-end                                                          |
| Timeline                     | Fully scanned     | 0 confirmed, 1 suspected | KEEP + DECISION       | Dev-seeding guard depends on packaging                                       |
| Tools / packages             | Fully scanned     |                        0 | KEEP                  | Coming-soon gating correct                                                   |
| Vault upload path            | Fully scanned     |                        0 | KEEP                  | Server-persisted before store sync                                           |
| Notes                        | Fully scanned     |                        0 | KEEP                  | All mutations persist; indexed                                               |
| Vault files/folders/tags     | Fully scanned     |                        0 | KEEP                  | Coherent soft-delete lifecycle; all three actions persist                    |
| Sessions                     | Partially scanned |                        0 | KEEP                  | Attribution fixed previously (`c7ae7d4`); restart lifecycle not re-exercised |
| Presence / settings          | Partially scanned |                        0 | unknown               | Only reached via the store audit                                             |
| UI ↔ store sync              | Fully scanned     |                        0 | KEEP                  | 11 routes subscribe; `brain.tsx` refreshes via `eventService.onRecord`       |

**Coverage.** Fully covered: workspace store (all 42 actions), tasks, projects, search/FTS, timeline, tools/packages, notes, vault (upload + trash lifecycle), UI ↔ store synchronisation across all 19 routes.

Remaining for a second pass, and deliberately not claimed as clean: **session start/end lifecycle across a restart**, and **presence/settings as independent subsystems** — both were reached only through the store-action audit, which proves their writes persist but does not exercise their behaviour.
