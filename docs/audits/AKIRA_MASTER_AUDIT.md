# AKIRA MASTER AUDIT

**Audit type:** Independent read-only architectural, reliability, security, data-integrity, performance, testing and documentation review.
**Date:** 2026-09-02
**Commit:** `f2d8cf6` on `main` (working tree dirty: 1 modified file, 8 untracked paths)
**Scope:** entire repository — 373 TS/TSX source files, 64,224 LOC, 42 test files, 105 documentation files.
**Method:** full static import graph (2,020 edges, SCC analysis), `tsc`, `vite build`, `vitest run`, `eslint`, `npm audit`, targeted isolated probes for two security hypotheses, and line-level reading of every subsystem's core files.
**Production code modified:** none. Two throwaway probe test files were created and deleted; no source, test, config or dependency was changed.

Phase reports: [01 Repository Map](01-repository-map.md) · [02 Boundaries](02-architecture-boundaries.md) · [03 Dependencies](03-dependencies-and-coupling.md) · [04 AKIRA OS](04-akira-os-platform.md) · [05 GENESIS](05-genesis-cognitive-system.md) · [06 Data Integrity](06-data-integrity.md) · [07 Reliability](07-reliability-and-failure.md) · [08 Testing](08-testing-audit.md) · [09 Security](09-security-audit.md) · [10 Performance](10-performance-audit.md) · [11 Code Quality](11-code-quality.md) · [12 Documentation](12-documentation-audit.md)

---

## Executive Summary

AKIRA is an ambitious, unusually well-*designed* system whose designs are, in several load-bearing places, not connected to each other. The layering intent is sound and the hardest architectural boundaries genuinely hold. But the application does not currently build, the cognitive layer receives almost no input and persists nothing, and no automated gate exists that would have reported either fact.

The central discovery of this audit is not a bug. It is that **AKIRA's documentation, test file names, ADRs and changelog collectively describe a system that is more connected than the code is.** Three fully-built subsystems import nothing and are imported by nothing. Two event buses coexist with a one-way bridge. 4,230 lines of platform test code assert zero things. The gap is not skill — the newest GENESIS test suites and the Platform Runtime are high-calibre work — it is that nothing in the repository ever checked.

### Health ratings

| Dimension | Rating | Basis |
| :--- | :--- | :--- |
| **Architecture Health** | **Fair** | The five hardest boundaries hold cleanly: no cognition in the platform; no UI, runtime, storage or permissions in GENESIS; the read-only `WorkspaceProvider` seam is respected in all 12 read sites. But the AKIRA OS → GENESIS *event* seam does not exist in running code, `persistence` and `akira-os` are bidirectionally coupled in a 19-file cycle, and `contracts`/`shared` both import upward. |
| **Reliability Health** | **Poor** | The build fails. 36 workspace database writes are fire-and-forget with zero `.catch()`. A synchronous spin-wait can block the server event loop for ~15 s. Errors are swallowed at eight distinct subscriber boundaries. One measured strength: the h3 error-normalisation in `server.ts` is genuinely well done. |
| **Data Integrity Health** | **Poor for cognition, Fair for workspace** | Workspace reality has real integrity machinery (CHECK constraints, FK cascades, 22 indexes, FTS triggers, a genuinely robust migration path) undermined by unobserved write failures. Vault deduplication corrupts sibling records on soft delete. The Timeline's "resilience" buffer is a permanent data sink. **No GENESIS cognitive state is persisted at all** — the reconstruction path reads a field that is hard-coded empty. |
| **Security Health** | **Fair** | Clean on the classic risks: prepared statements throughout (no injection found), no `eval`/`Function`/`child_process`, no committed secrets, and a prototype-pollution hypothesis probed and **disproven**. Real issues: `VITE_*` API keys inline into the client bundle, keys stored in plaintext SQLite, a confirmed path-traversal prefix bypass, 40 of 41 RPC validators are no-ops with no origin checking, and the Permission Framework performs no authorization. |
| **Test Confidence** | **Very Poor** | `vitest run` reports "270 passed" while **20 of 42 files execute zero tests**. Every AKIRA OS platform defect in this audit sits in a subsystem whose test file cannot run. The largest GENESIS suite (1,533 LOC, 213 assertions) fails at import. There is no CI, no `typecheck` script, and `npm run test` runs watch mode. |
| **Maintainability** | **Fair** | Strong, uniform patterns (14 GENESIS rule-engine subsystems; an identical client-facade/server-RPC split across 8 modules; typed error hierarchies in the runtime). Weakened by 66 zero-inbound-import files, 4 byte-identical duplicate files, 3 loggers, 2 event buses, 371 `any`, two 1,600–2,100-line route components, and **zero TODO/FIXME markers anywhere** — so scaffolding is indistinguishable from product. |
| **Technical Debt** | **High, and concentrated** | ~3,750 LOC of built-but-unwired subsystems (observability, diagnostics, compatibility). 4,230 LOC of non-functional tests. A lint gate configured to detect only formatting. Documentation asserting seven test suites that do not exist. The debt is unusually *localised*, which is good news for remediation. |

---

## Overall Verdict

# REQUIRES REMEDIATION

**Why not "Conditionally Approved":** conditional approval would be appropriate if the system worked and carried known risks. Three conditions rule that out, and each is objectively verifiable rather than a judgement call:

1. **The application does not build.** `npx vite build` fails on `src/genesis/planning/services/AdaptivePlanningService.ts` importing `../health/createHealthRuleEngine`, a file that has never been committed. The failure is on the **client** hydration path, so no production bundle can be produced from `main` at all. `tsc --noEmit` reports 103 errors across 39 files, including 19 imports of files that do not exist.

2. **The product's central claim does not function.** AKIRA is "a local cognitive assistant that records reality, builds memory graphs, and suggests proactive initiatives" (README). In the running code, GENESIS is subscribed to an event bus that no workspace mutation ever publishes to, and stores every memory, story, understanding, insight, identity node and plan in process-local JavaScript arrays with no serialisation. Completing a task produces no cognitive effect, and closing the app discards everything. GENESIS v2.17 REMEMBER and v2.18 UNDERSTAND are marked COMPLETE; structurally they are, functionally they are not reachable.

3. **Nothing would have caught either.** No CI workflow, no git hooks, no `typecheck` script, a lint configuration that disables every rule except formatting, `npm run test` in watch mode, and 20 test files that report zero tests while the runner prints "270 passed".

**What this verdict is not.** It is not a judgement that the architecture is wrong or that the work should be redone. The intended layering is sound, the Platform Runtime is the best-engineered code in the repository, the SQLite schema and migration machinery are genuinely well built, and the GENESIS rule-engine pattern is a real asset. **The remediation required is wiring and enforcement, not redesign.** Items 1 and 3 are days of work. Item 2 is weeks, and it is the real project.

---

## Critical Findings

Seven findings meet the bar. Each is reproducible from the evidence given.

---

### CRIT-001 — The application does not build; two files were never created

```
ID:                 CRIT-001  (see DEP-001, REL-001)
Severity:           CRITICAL
Affected System:    GENESIS Planning → entire client bundle
```

**Evidence:**
```
$ npx vite build
✓ 2329 modules transformed.
✗ Build failed in 1.81s
[UNRESOLVED_IMPORT] Could not resolve '../health/createHealthRuleEngine'
  in src/genesis/planning/services/AdaptivePlanningService.ts
  Help: imported by → planning/index.ts → genesis/index.ts → routes/__root.tsx
        → routeTree.gen.ts → app/router/router.tsx → router.tsx
        → @tanstack/start-client-core/hydrateStart      ← the CLIENT entry
```
`src/genesis/planning/health/HealthRuleEngine.ts` is 57 lines containing **two modules concatenated into one file**, the second carrying its own path header at line 51:
```ts
// src/genesis/planning/health/HealthRuleEngine.ts      ← line 1
import { HealthyRule } from "./rules/HealthyRule";      ← line 9, file does not exist
export class HealthRuleEngine { … }
// src/genesis/planning/health/createHealthRuleEngine.ts   ← line 51, same file
import { HealthRuleEngine } from "./HealthRuleEngine";     ← self-import
export function createHealthRuleEngine() { … }
```
`git ls-files src/genesis/planning/` confirms neither `createHealthRuleEngine.ts` nor `rules/HealthyRule.ts` has ever been committed. `git show HEAD:…/AdaptivePlanningService.ts` shows the broken import already present at `HEAD` — this is not working-tree damage.

**Risk:** no deployable artefact exists. `tests/genesis-planning.test.ts` (1,533 LOC, 81 blocks, 213 assertions) cannot load, so the Planning Foundation has zero verification.

**Root Cause:** code generated as a multi-file blob and committed without running `tsc` or `vite build` — with no gate to notice (CRIT-007).

**Recommended Action:** split `HealthRuleEngine.ts` into the two intended files; create `rules/HealthyRule.ts`; reconcile `HealthEvaluation.ruleId` against the `ruleName` emitted by all five producers (DEP-002).

**Fix Complexity:** Trivial (under an hour). The finding's weight is in what it reveals, not what it costs.

---

### CRIT-002 — GENESIS observes no reality: the two event buses are not connected

```
ID:                 CRIT-002  (see BND-001, GEN-001)
Severity:           CRITICAL
Affected System:    AKIRA OS ↔ GENESIS boundary — the product's core data flow
```

**Evidence — three independent facts:**

1. GENESIS's sole reality intake is on the **legacy** bus, `src/genesis/events/event-service.ts:94`:
   ```ts
   eventBus.subscribe("*", (evt) => { switch (evt.type) { /* project.*, task.*, note.*, mission.*, presence.* */ } });
   ```
2. `src/persistence/akira-store.ts` — the single writer of all workspace reality — publishes at **17 sites**, every one to the **instrumentation** bus:
   ```ts
   import { publish } from "../instrumentation";
   publish({ type: "task.completed", source: "tasks-store", … });   // line 270
   ```
   `grep -c "Events\." src/persistence/akira-store.ts` → **0**.
3. Exhaustive census of `eventBus.publish(` (legacy bus) in `src/`: only `presence/service.ts` (3 sites), `runtime/lifecycle-manager.ts` + `capability-registry.ts` (11 sites that never fire because no modules are loaded), `runtime-manager.ts:449`, and test files. **No workspace domain event ever reaches the legacy bus.**

The only bridge runs legacy → instrumentation, asynchronously, with all errors discarded and one event type silently excluded (`src/shared/infrastructure/event-bus/index.ts:64-80`):
```ts
import("../../../instrumentation").then(({ publish }) => {
  if (eventType !== "presence.updated") { publish({ … }); }
}).catch(() => {});
```

**Risk:** GENESIS can observe exactly one class of event — `presence.updated`. The entire v2.17/v2.18 pipeline (candidates → validation → memories → stories → understanding → insights → recall → importance) is fed only by presence heartbeats and by GENESIS's own synthetic bootstrap event. The AI receives a system prompt containing intent metadata and project names, and nothing cognitive.

**Verifiable prediction:** in a running instance after normal workspace use, `memoryService.getMemories()` will contain only entries titled `"Companion State Bootstrapped"` or `"Presence Context Resolved"`.

**Root Cause:** an event-system migration ("Sprint 2.1 fallback bridge", per the legacy bus's own comment) moved every producer to the new bus and left the single consumer behind. The bridge was built producer→store, the direction the migration needed, not store→consumer.

**Recommended Action:** make the instrumentation bus the single bus. Register a GENESIS subscriber (`EventSubscriber` with an `id`) on `globalEventBus` and delete the legacy bus and its bridge. Move `presenceService` to `publish()` at the same time. Do **not** add a reverse bridge — that would preserve two buses and re-introduce the `presence.updated` exclusion problem.

**Fix Complexity:** Medium. One new subscriber, three `presenceService` call sites, deletion of one file, and an event-name reconciliation (CRIT-003). The risk is in the ordering/duplicate semantics that change when GENESIS starts seeing the real firehose — see CRIT-005 and PERF-003/004.

---

### CRIT-003 — Duplicate keys in the central event registry silently remap task events

```
ID:                 CRIT-003  (see BND-002)
Severity:           CRITICAL
Affected System:    src/contracts/events.ts — the shared event vocabulary
```

**Evidence:** `src/contracts/events.ts`
```
line  6:  TASK_CREATED:   "task.created"
line  7:  TASK_COMPLETED: "task.completed"
line 76:  TASK_CREATED:   "planning.task.created"      ← later declaration wins
line 77:  TASK_COMPLETED: "planning.task.completed"    ← later declaration wins
```
`tsc` confirms: `src/contracts/events.ts(76,3): error TS1117` and `(77,3): error TS1117`.

**Risk:** `src/genesis/events/event-service.ts:121` — `case Events.TASK_COMPLETED:` compares against `"planning.task.completed"`. **Even after CRIT-002 is fixed, completing a task in the workspace still produces no memory event.** Task completion is the single most important user action in the product, and it is unreachable through the registry. Additionally `akira-os/timeline/service.ts:83,122` emits `planning.*` names that are absent from `TimelineSubscriber`'s allowlist.

**Root Cause:** the Planning capability (v2.19+) added its own task events to the shared registry without namespacing, and JavaScript's silent last-wins object semantics hid the collision from everything except `tsc` — which is not run.

**Recommended Action:** rename the planning entries to `PLANNING_TASK_CREATED` / `PLANNING_TASK_COMPLETED`, and audit the other four ambiguous re-exports (`GoalStatus`, `HabitStatus`, `RelationshipStatus`, `GoalCategory` — DEP-011). Add `tsc` to CI so `TS1117` can never ship again.

**Fix Complexity:** Trivial to fix, but must be sequenced with CRIT-002 — fixing either alone leaves task events broken.

---

### CRIT-004 — No GENESIS cognitive state is persisted; the reconstruction path is dead code

```
ID:                 CRIT-004  (see GEN-002)
Severity:           CRITICAL
Affected System:    GENESIS — memory, stories, understanding, insights, identity, planning
```

**Evidence — the whole chain, verified end to end:**

Every GENESIS store is a module-scope array. There is no `Sqlite*Repository` anywhere under `src/genesis/`; all 8 repository implementations are `InMemory*`. The two files named "serializer" are **natural-language renderers for AI prompts**, not persistence serialisers.

The reconstruction guard can never be true — `src/genesis/memory/memory-service.ts:98`:
```ts
reconstructRuntimeMemory(): void {
  const storeMemories = getMemories();
  if (storeMemories && storeMemories.length > 0) {   // ← never true
```
because `getMemories()` → `akira-store.state.memories`, and `state.memories` is only ever populated by `akira.initializeState(getInitialState())`, whose source is `src/persistence/store-init.ts`:
```ts
return { projects, tasks, notes, sessions, activeSession, profile, lastProjectId, chat, streaks,
         memories: [],                    // ← hard-coded empty, always
         vaultFiles, vaultFolders };
```
And the write side never reaches SQLite — `src/persistence/akira-store.ts:920`:
```ts
saveMemory: (event) => { set((s) => ({ ...s, memories: [event, ...s.memories] })); }
```
No RPC, no repository, no table. `schema.sql` has no `memories` table.

**Risk:** a page reload, a `vite dev` restart, or closing the app discards every memory, story, understanding, insight, identity node and plan. The stated capability "v2.17 — REMEMBER — COMPLETE" is not satisfiable by this code. `memoryService.initialize()`'s comment ("1. Reconstruct Runtime Memory / 2. Build Recall Index") describes behaviour that cannot occur.

**Root Cause:** GENESIS was correctly designed as *derived* state — memories are reconstructed by replaying events, which is why no memory table exists and why `reconstructRuntimeMemory` replays through `candidateService`. That design is sound. But the durable event source it needs (the `events` table, which **does** exist and **does** work) was never connected to it. The design assumed a `store.memories` array that would be hydrated from somewhere, and nobody built the somewhere.

**Recommended Action:** keep the derived-state design. Replace `getMemories()`'s source with a paged read of the `events` table via a new RPC, and delete the `saveMemory` → `state.memories` path entirely (it is a duplicate of the Event Store). Then reconstruction becomes: read events → replay through `candidateService.evaluateEvent` → memories rebuild deterministically. **Three things must land in the same change**: idempotency in the candidate/memory pipeline (CRIT-005), a token budget on prompt assembly (PERF-004), and a bounded rebuild strategy (PERF-003) — otherwise fixing this converts silent inertness into duplicate memories, unbounded prompts, and quadratic rebuilds.

**Fix Complexity:** High. This is the real v2.x engineering work, not a bug fix.

---

### CRIT-005 — Workspace writes are fire-and-forget: 36 sites, zero error handling

```
ID:                 CRIT-005  (see DAT-001, REL-003)
Severity:           CRITICAL
Affected System:    src/persistence/akira-store.ts — all user data
```

**Evidence:**
```
grep -c 'import("../akira-os'  src/persistence/akira-store.ts  →  36
grep -c '\.catch('             src/persistence/akira-store.ts  →   0
grep -c 'await '               src/persistence/akira-store.ts  →   0
```
Canonical shape (line 131):
```ts
set((s) => ({ ...s, projects: [p, ...s.projects], lastProjectId: p.id }));
import("../akira-os/projects").then(({ projectsService }) => {
  projectsService.add(p);        // async — returns a Promise that is discarded
});
```

**Risk / failure scenario:** the user creates a project while the SQLite file is write-locked past `busy_timeout = 5000`, or the dev server has restarted, or the RPC 500s. The UI shows the project. No toast, no console error, no retry, no queue, no rollback. On the next reload `getInitialState()` returns the database contents and the project is simply gone. This applies to **every** project, task, note, session, chat message, streak and settings write in the application.

A rejection inside a `.then` callback is an unhandled rejection; on Node (15+) that terminates the process if this path ever executes server-side.

**Root Cause:** `ARCHITECTURE.md` §2.2 legitimately specifies "Optimistic State Mutation … dispatching database mutations lazily". Optimistic mutation requires reconciliation or rollback on failure. Only the optimistic half was implemented. The pattern is known to the team — `__root.tsx:216-241` wraps hydration in `try/catch` with `toast.error`.

**Recommended Action:** route all 36 sites through one helper that `await`s the write, surfaces failure via `toast.error`, and either retries with backoff or reverts the optimistic state. **Handle DAT-009 in the same change**: client-generated `id`s currently survive to the repository only because the RPC validators are no-ops; adding real validation without adding `id` to the schemas will silently desynchronise every client-held id from the database.

**Fix Complexity:** Medium — mechanical across 36 sites, but the reconcile/revert semantics need a deliberate decision.

---

### CRIT-006 — Vault deduplication corrupts sibling records on soft delete

```
ID:                 CRIT-006  (see DAT-002, DAT-003)
Severity:           CRITICAL
Affected System:    src/akira-os/vault/VaultStorageService.ts — irreplaceable user files
```

**Evidence:** dedup makes multiple `vault_files` rows share one physical `storage_path` (`uploadFile`, lines 88-113). `deleteFile` (lines 238-258) moves that shared file and updates one row:
```ts
const sourcePath = VaultValidationService.resolveSafePath(file.storagePath);
if (fs.existsSync(sourcePath)) { fs.renameSync(sourcePath, trashAbsolutePath); }   // shared file
vaultFileRepository.update(fileId, { deletedAt: …, storagePath: trashRelativePath }); // one row
```

**Failure scenario:** the user uploads `report.pdf`, then the identical file as `report-final.pdf` → two rows, one physical file. Deleting `report.pdf` moves the file to `Trash/`. `report-final.pdf` remains `status: "Ready"`, `deletedAt: null`, pointing at a path that no longer exists. Opening it throws `"File is missing from disk"`. **The user has lost a file they never deleted.** `restoreFile` has the mirror defect.

**The correct logic exists 60 lines away** — `permanentDeleteFile` refcounts properly via `vaultFileRepository.countReferencesByHash(file.hash)` and unlinks only when `count === 1`. `deleteFile` simply does not call it.

**Compounding (DAT-003):** `uploadFile` sets its rollback guard `committed = true` **inside** the transaction body, before `COMMIT` is issued — so a commit failure skips the compensating `unlink` and leaves an orphan file with no database row. `permanentDeleteFile` unlinks inside a transaction with no compensation at all. `deleteFile`/`restoreFile` use no transaction whatsoever.

**Risk:** silent, permanent loss of user files. The vault is the one subsystem holding data AKIRA cannot regenerate.

**Root Cause:** dedup, soft delete and permanent delete were built as three independent features; only the last one accounted for the sharing the first one creates. `src/akira-os/vault/vault.test.ts` — which would have caught this — is a hand-rolled script asserting nothing (CRIT-007).

**Recommended Action:** refcount by hash in `deleteFile` and `restoreFile` (copy-on-delete, or move only when it is the last live reference). Move all filesystem operations outside the SQLite transactions and compensate after commit confirmation. Set `committed = true` after `})()`, not inside.

**Fix Complexity:** Medium. Requires deciding the dedup ownership model (reference-counted physical files vs. copy-on-delete) before coding.

---

### CRIT-007 — No automated quality gate exists, and the test runner reports success while 20 files run nothing

```
ID:                 CRIT-007  (see TST-001, TST-002, TST-003, QUA-001)
Severity:           CRITICAL
Affected System:    the whole repository — this is the meta-finding
```

**Evidence:**
```
$ npx vitest run
 Test Files  20 failed | 22 passed (42)
      Tests  270 passed (270)
```
**Twenty of forty-two test files execute zero tests, and the summary line says "270 passed" with no failures.**

- 18 files under `src/` implement their own `test()`/`assertEquals()` micro-framework and never call `describe`/`it`/`expect`. `vitest` collects them and reports `Error: No test suite found in file …`. **4,230 lines of test code, 0 assertions.** (`src/akira-os/vault/vault.test.ts` even declares `const totalTests = 0; const passedTests = 0;` — its own counters cannot increment.)
- `tests/genesis-planning.test.ts` (1,533 LOC, 213 assertions) fails at import due to CRIT-001.
- `src/app/ui/timeline/timeline-interaction.test.ts` fails on `Cannot find package '@/app/shell/Shell'` — `vitest.config.ts` loads no tsconfig-paths plugin, so `@/` is unresolvable in tests. Confirmed by isolated probe during this audit.
- `.github/` contains only `CODEOWNERS`. No workflows. `.git/hooks/` holds only samples.
- `package.json` has **no `typecheck` script**, and `npm run test` is bare `vitest` — **watch mode**, which never terminates and therefore cannot gate anything.
- `npm run lint` reports 25 errors, **all** `prettier/prettier`. `eslint.config.js` disables `no-explicit-any`, `no-unused-vars`, `no-empty` and `react-hooks/exhaustive-deps`; `tsconfig.json` sets `noUnusedLocals: false`, `noUnusedParameters: false`.
- `npm run validate:architecture` cannot execute (5 unresolved imports in the script) — and validates SQLite migrations, not architecture.
- `CONTRIBUTING.md` §3.3 tells contributors to run `npm run type-check`, which has never existed.

**Which subsystems are consequently unverified:** Event Store, Event Bus, event **ordering**, **fault injection**, instrumentation↔timeline integration, Analytics engine/rebuild/consistency, Vault storage/dedup/validation, universal search + FTS, Timeline repository and UI, Presence Engine, tool registry, vault UI.

**Every AKIRA OS platform defect in this audit sits in a subsystem whose test file cannot run.** The tests were written to cover exactly these areas.

**Risk:** this is the finding that produced most of the others. CRIT-001, CRIT-003, CRIT-006, DOC-002 and the three unwired subsystems all reached `main` because nothing reported them.

**Root Cause:** the test suite predates the migration to `vitest` and was never converted; the config change that broke `@/` aliases in tests was never noticed; and because there is no CI, "20 failed" has never blocked anything.

**Recommended Action, in this order:**
1. Add `"typecheck": "tsc --noEmit"`; change `"test"` to `"vitest run"`.
2. Add a GitHub Actions workflow running `npm ci && npm run typecheck && npm run lint && npm run test && npm run build`. This makes `CONTRIBUTING.md` §3.3 true.
3. Convert the 18 hand-rolled files to `vitest` — mechanically, `test(` → `it(`, `assertEquals(a,b,m)` → `expect(a).toBe(b)`, wrapped in `describe`. The test *logic* is already written; only the harness is wrong.
4. Add `tsconfigPaths()` to `vitest.config.ts` and point `setupFiles` at the real root `setup.ts`.
5. Re-enable `@typescript-eslint/no-unused-vars` and `react-hooks/exhaustive-deps` (leave `no-explicit-any` off initially — 371 occurrences would drown the signal).

**Fix Complexity:** Steps 1–2 and 4: hours. Step 3: days, and the highest-return days available in this project.

---

## Architectural Deviations

Intended architecture (per the project brief):

```
AKIRA OS ──events──► GENESIS ──context──► AI Provider ──► LLM Response
```

| # | Deviation | Classification | Assessment |
| ---: | :--- | :--- | :--- |
| 1 | The `AKIRA OS → GENESIS` event arrow does not exist; two buses, one-way bridge, `presence.updated` excluded | **Dangerous** | CRIT-002. The product's core data flow. Blocks every cognitive capability. |
| 2 | GENESIS persists nothing; the event store it should read from is not connected to it | **Dangerous** | CRIT-004. Contradicts "v2.17 REMEMBER COMPLETE". |
| 3 | The whole GENESIS layer (208 files) is compiled into the **client** bundle via `__root.tsx → @/genesis` | **Dangerous** | BND-003. One missing file in the cognitive layer takes down the client (this is CRIT-001's blast radius). Also ships 21,657 LOC and 9 import-time side effects to the browser. |
| 4 | 9 GENESIS modules self-initialise at import time; the Lifecycle Manager governs none of them | **Technical debt** | BND-004. Deliberate shortcut that works today; makes ordering implicit and teardown impossible. |
| 5 | AI provider calls go browser → third party directly, bypassing the RPC layer, with `VITE_*` keys inlined | **Dangerous** | SEC-002. The one place the otherwise-consistent client/server split is abandoned, and the place it matters most. |
| 6 | `persistence` ↔ `akira-os` bidirectional, 19-file dependency cycle via a `db.prepare` monkey-patch | **Technical debt** | BND-005. Works; makes both layers untestable and unreplaceable in isolation. |
| 7 | `contracts/` imports a feature module's types and holds mutable global state | **Accidental** | BND-006. Two small violations of a rule the document states plainly; cheap to fix. |
| 8 | `shared/` imports `genesis` and `instrumentation` (upward edges from the base layer) | **Accidental** | BND-006. Same. |
| 9 | The Platform Runtime (37 files, ADR-016…020) has zero production consumers | **Technical debt** | BND-007. **Not** an unfinished-feature exclusion: it is implemented, documented and unit-tested — just never adopted. This is the gap that blocks third-party modules, TITAN and FORGE. |
| 10 | The Permission Framework performs no authorization — `require()` only checks catalog membership and has zero call sites | **Dangerous (for modules)** | SEC-005 / PLT-019. Harmless while no modules load; a total absence of privilege boundary the moment one does. |
| 11 | The Platform SDK is untyped (`unknown` × 9), mis-versioned (exact equality vs. semver range), rewrites every error as `PermissionRequiredError`, and does not compile | **Dangerous (for modules)** | DEP-005/006. The declared stable module contract provides no type checking, no compatibility guarantee, and no usable diagnostics. |
| 12 | Observability (34 files, 11 docs, ADR-021), Diagnostics (4 files, 7 missing imports) and Compatibility (15 files) are unwired and non-compiling | **Technical debt** | QUA-004. ~3,750 LOC of documented capability that does not exist. Meanwhile the app logs via 192 `console.*` calls and two duplicate ad-hoc loggers. |
| 13 | RPC "Validation Framework" is 1 real validator out of 41 | **Dangerous** | PLT-001 / SEC-004. `zod` is installed and used correctly elsewhere in the repo. |
| 14 | `vite.config.ts` disables `importProtection`, which `DIRECTORY_STRUCTURE.md` §3 promises as a build-time guarantee | **Dangerous** | PLT-004. Server-only isolation rests on 4 hand-written `throw` guards. |
| 15 | Analytics stores UTC-bucketed aggregates while the query layer buckets by timezone offset | **Dangerous** | PLT-014. Derived data is correct only for UTC users, and `ConsistencyChecker` recomputes in UTC so it cannot detect the error it exists to detect. |
| 16 | Millisecond event timestamps with no ordering tiebreaker on 4 of 5 query methods | **Dangerous** | PLT-006. The repo's own benchmark measures 12–22 events per millisecond, so collisions are the norm. Causes PLT-015 (rebuild skips events). |
| 17 | Analytics validation subsystem bypasses `AnalyticsRepository` with 17 raw `db.prepare` calls | **Technical debt** | PLT-002. The code that verifies derived data does not use the abstraction it verifies. |
| 18 | Schema versioning is `if (!tableExists)` feature detection; `schema_version` only ever holds `1`; `migrations/002_file_vault.sql` is dead while its DDL is inlined | **Technical debt** | PLT-003 / DAT-007. No forward path for column-level changes on any user's database. |
| 19 | GENESIS imports `akira-os/presence/types` in 12 files instead of a published contract | **Harmless today, debt tomorrow** | BND-008. Direction is correct (downward); the target is an internal type. |
| 20 | `brain.tsx` (2,106 LOC) and `chat.tsx` (1,610 LOC) reach directly into 24 and 19 subsystems, violating "routes contain no business logic" | **Technical debt** | QUA-005. `chat.tsx` calls `companionStateService.bootstrap()`, re-initialising the cognitive layer from a route. |
| 21 | No cognition in AKIRA OS; no UI, runtime, storage or permissions in GENESIS; `WorkspaceProvider` respected in 12/12 read sites | **INTENTIONAL — and it holds** | The five hardest boundaries are clean. Verified by exhaustive edge analysis: zero `akira-os → genesis`, zero `genesis → persistence`, zero `genesis → runtime`, zero `genesis → app/components/routes` edges. **This is the audit's most important positive finding.** |
| 22 | TITAN and FORGE absent | **INTENTIONAL** | Per brief, correctly excluded. Note however that `ROADMAP.md` §2.2/§3.2 and `ARCHITECTURE.md` §6 define both **differently** from the brief (a job queue and a shell-script sandbox, vs. a capability-architecture layer and an engineering layer). Two irreconcilable canons exist; one must be retired (DOC-003). |

---

## Top 10 Recommended Actions

Prioritised by Risk × Impact × Urgency. Architectural and reliability items rank above cosmetic ones throughout.

| # | Action | Addresses | Effort | Why this rank |
| ---: | :--- | :--- | :--- | :--- |
| **1** | **Add the CI gate.** `"typecheck": "tsc --noEmit"`; change `"test"` to `"vitest run"`; a workflow running `npm ci && typecheck && lint && test && build`. | CRIT-007 | Hours | Highest leverage in the project. Makes `CONTRIBUTING.md` §3.3 true and permanently closes the channel that produced CRIT-001, CRIT-003, CRIT-006 and DOC-002. Everything below is worth less if this is not first. |
| **2** | **Fix the build.** Split `HealthRuleEngine.ts`; create `rules/HealthyRule.ts`; align `HealthEvaluation.ruleId`/`ruleName`. Then clear the remaining 19 unresolved imports. | CRIT-001, DEP-002 | Hours–days | Nothing can be shipped, measured or bundle-analysed until the build completes. Trivial work with total blocking impact. |
| **3** | **Convert the 18 hand-rolled test files to vitest** and add `tsconfigPaths()` to `vitest.config.ts`. | CRIT-007, TST-002 | Days | The test *logic* for the Event Store, ordering, fault injection, analytics, vault and search is already written. Converting the harness immediately gives real coverage over the exact subsystems where CRIT-006, PLT-006 and PLT-014 live — and will likely surface more. |
| **4** | **Unify the event bus.** Register a GENESIS `EventSubscriber` on `globalEventBus`; move `presenceService` to `publish()`; delete `shared/infrastructure/event-bus` and its bridge; namespace the duplicate `Events` keys. | CRIT-002, CRIT-003, PLT-005, BND-005 (partly) | Weeks | Unblocks the entire product thesis. Sequenced after 1–3 so the change is verifiable rather than hopeful. |
| **5** | **Make workspace writes durable and observable.** One helper that awaits, surfaces failures via `toast.error`, and retries or reverts — applied to all 36 sites. Add `id` to the RPC schemas at the same time. | CRIT-005, DAT-009 | Days | Silent loss of user data outranks everything except being able to build and test. Independent of item 4, so it can run in parallel. |
| **6** | **Fix the vault dedup lifecycle.** Refcount by hash in `deleteFile`/`restoreFile`; move filesystem operations outside SQLite transactions; correct the `committed` flag placement. | CRIT-006, DAT-003 | Days | The only user data AKIRA cannot regenerate. Currently loses files the user never deleted. |
| **7** | **Persist GENESIS on the Event Store.** Read events for reconstruction; delete the `saveMemory` → `state.memories` path. **Must ship with** idempotency in the candidate/memory pipeline, a token budget on prompt assembly, and a bounded understanding-rebuild. | CRIT-004, GEN-004, PERF-003, PERF-004 | Weeks | The real v2.x work, and the prerequisite for v2.19+ IDENTITY to mean anything across sessions. Ranked below 1–6 only because those are cheaper and are its preconditions. |
| **8** | **Close the two highest-value security gaps.** Move AI provider calls behind a server RPC so no key reaches the client bundle or a URL query string; replace the 40 identity validators with `zod` schemas and add an `Origin`/`Host` check in `server.ts`. Fix `resolveSafePath` to `resolved === root \|\| resolved.startsWith(root + path.sep)`. | SEC-002, SEC-003, SEC-004, PLT-001 | Days | Both use machinery the codebase already has. The path-traversal bypass is confirmed by probe and sits on every vault read, move and delete. |
| **9** | **Remove the event-loop blocker and reconcile analytics time.** Delete `SqliteSearchRepository.executeWithRetry`'s spin-wait (SQLite's `busy_timeout` already handles contention); make `RebuildManager` and `ConsistencyChecker` use `clockService.getBucketKey`; add a `rowid`/sequence tiebreaker to the 4 unordered Event Store queries. | REL-002/PERF-007, PLT-014, PLT-006, PLT-015 | Days | The only measured performance bottleneck in the repo, plus the two derived-data correctness defects. All three are small, evidence-backed, and low-risk. |
| **10** | **Resolve the canon, then delete the dead weight.** Declare one definition of TITAN/FORGE authoritative and retire the other; fix the 25 absolute `file:///` README links; correct `changelog.md`'s seven false test claims and 27 broken paths; delete the ~26 genuinely dead files and the 4 byte-identical duplicates; add `TODO(owner):` markers or `Status:` lines to the three unwired subsystems and their ADRs. | DOC-003, DOC-002, DOC-010, QUA-003, QUA-004, QUA-002 | Days | Last by risk, but it is what makes the codebase legible to the next reviewer — human or agent. Two irreconcilable definitions of the next two pillars is a genuine planning hazard, not a cosmetic one. |

**Explicitly de-prioritised:** the 371 `any` occurrences, the 36 unused shadcn/ui primitives, file-naming inconsistencies, and the 5 `npm audit` advisories (all build-time, none reachable at runtime). None of these should displace anything above.

---

## What Should NOT Be Changed

A good audit prevents unnecessary refactoring. These are assets. Preserve them verbatim through every action above.

### Architecture and boundaries

- **The five clean boundaries.** No cognition in AKIRA OS. No UI, platform runtime, generic storage, or platform permissions in GENESIS. Verified by exhaustive edge analysis, not assertion. These are the hardest boundaries to retrofit and they already hold — remediation must not disturb them.
- **`src/contracts/workspace-provider.ts` as a seam.** The read-only `getState()`/`subscribe()` contract, honoured in all 12 GENESIS read sites, with zero `genesis → persistence` or `better-sqlite3` imports anywhere. This is the single best design decision in the repository. (Its mutable-global *implementation* detail is a separate, minor fix.)
- **The `akira-os/*/{services,server}` split.** Applied identically across all 8 feature modules: a client facade of RPC proxies, a server module of `createServerFn` handlers, `better-sqlite3` reachable from neither the client graph nor the facade. This is what keeps the client bundle sane without a build plugin.
- **`src/contracts/repositories/*`.** Eleven clean interfaces with `Sqlite*` implementations behind them.

### The Platform Runtime — the best-engineered code in the repository

Do not refactor `src/runtime/manifest/`, `src/runtime/resolver/`, `src/runtime/registry/` or `src/runtime/module-state.ts`. Specifically:
- `manifest-schema.ts` — real `z.strictObject`, strict semver and semver-range regexes.
- `manifest-validator.ts` — zod issues mapped onto a typed error hierarchy (`MissingFieldError`, `InvalidVersionError`, `UnknownPropertyError`, `DuplicateModuleError`, `DuplicateCapabilityError`, `DuplicateRouteError`).
- `dependency-resolver.ts` — manifests sorted by id before graph construction (deterministic), explicit missing-dependency and cycle detection, startup **and** shutdown ordering.
- `capability-registry.ts` — multi-provider, pluggable `CapabilitySelector`, semver-range filtering, deterministic `providerModule.localeCompare` tiebreak, distinct not-found vs. version-mismatch errors.
- `module-state.ts` + `isValidTransition` — an explicit, guarded state machine.
- `lifecycle-timeout.ts` `withTimeout` — every hook time-bounded.

The problem with this subsystem is **adoption, not quality**. Wire it; do not rewrite it.

### Data layer

- **`persistence/schema.sql`** — real `CHECK` constraints (`favorite IN (0,1)`, `size_bytes >= 0`, `status IN (…)`, `entity_type IN (…)`), FK cascade/`SET NULL` rules on every relation, `UNIQUE(file_id, entity_type, entity_id)`, and 22 well-chosen indexes that match the actual query patterns.
- **FTS5 + 18 trigger-maintained index** — `tokenize = 'porter unicode61'`, kept current on insert/update/delete across projects, tasks, notes, sessions and timeline events. Correct design; search is O(index).
- **The polymorphic-link and tag-GC triggers** — `trg_vault_links_cleanup_*` and `trg_vault_file_tags_cleanup` correctly cover integrity that foreign keys cannot.
- **`persistence/migration-impl.ts`** — idempotency via a `migration_history` table with staged status, guarded JSON parse, per-field array-shape validation, schema-version precondition, transactional import, typed discriminated result. The most defensively written code in the repository.
- **PRAGMA choices** — WAL, `foreign_keys = ON`, `busy_timeout = 5000`, `auto_vacuum = INCREMENTAL`. Correct for a single-writer local-first app.
- **`SqliteTimelineRepository.findPaged`** — correct composite `(timestamp, id)` keyset pagination with proper tiebreaking in both sort directions. Do not "simplify" this to offset pagination.
- **Event Store pre-write validation** — serialisability, timestamp validity and version integrality checked before `INSERT`, with specific messages. The validation is right; only its downstream error handling is wrong.
- **Vault magic-byte MIME verification and streaming SHA-256** — real file-signature checks rather than trusting declared MIME; hashing without loading whole files into memory.

### GENESIS

- **The rule-engine pattern.** Fourteen subsystems following `types.ts` / `rules.ts` / `builder.ts` / `service.ts` / `events.ts` with pluggable strategy registries and provenance on every output. Uniform, testable, and a genuine asset. Do not consolidate it.
- **The evidence + confidence model.** Identity, presence, companion state, habits, relationships and reflection all carry evidence trails and confidence values, with user corrections locking confidence to 1.00 while preserving the trace. Unusually disciplined domain modelling.
- **Immutable graph rebuild** in `understandingEngine` (produces a new array, notifies only on change) and the `TRIVIAL_PHRASES` noise filter requiring both title *and* description to be trivial.
- **Separation of derivation from rendering** — engines emit structured objects; `serializer.ts`/`insight-serializer.ts` render prose separately. Correct layering, even though the renderers themselves carry hard-coded content.
- **`identity/types.ts`** (422 LOC) — consistent lifecycle/confidence/evidence shapes across interests, skills, goals, habits, preferences, values, relationships and personality.

### Reliability and tooling

- **`src/server.ts` h3 error normalisation.** `normalizeCatastrophicSsrResponse` detects h3's swallowed-throw shape (`{"unhandled":true,"message":"HTTPError"}`), recovers the real error via `consumeLastCapturedError()`, and renders a proper HTML page. Hard-won framework knowledge, correctly encoded. Do not touch.
- **The `__root.tsx` error boundary** — copy-to-clipboard diagnostics, dev-mode-gated stack traces, `router.invalidate() + reset()` recovery.
- **`provider-manager.saveConfig`'s overwrite guard** — explicitly refuses to overwrite non-empty stored keys with an empty config, and refuses to save before `configLoaded`. Prevents a real data-loss race.
- **`AbortSignal` support in both AI providers** — checks `signal?.aborted`, clears intervals, records the cancellation metric, rejects with a proper `DOMException`.
- **The `process.exit` ESLint rule** — the one custom lint rule that provides real value.
- **`CODEOWNERS`** — accurate ownership mapped to the real tree, with joint approval required on `contracts/`, `shared/` and `lib/`.
- **The newest GENESIS test suites** (`genesis-reasoning-*`, `genesis-reflection-*`, `genesis-decision-engine`, `genesis-relevance-engine`) — crash isolation, ordering preservation, instance-identity assertions, exact output-shape pinning, `Object.freeze` on fixtures. **This is the standard the rest of the suite should be raised to.** Use them as the conversion template for action #3.

### Performance — do not optimise

The index coverage, FTS design, keyset pagination, `SearchManager` TTL cache, `crypto.randomUUID()`, `useSyncExternalStore` + selectors, `@tanstack/react-virtual` virtualisation, streaming hash, and the ~40 lazy `await import()` server-isolation sites are all appropriate. The Event Store write path measures 12,166–22,598 events/sec at p95 0.10–0.17 ms — it is not a bottleneck and needs no work.

---

## Readiness Assessment

### GENESIS v2.19 — IDENTITY

**Status correction first:** v2.19 is **not** "NEXT". It is implemented (17 files, 15 services, a 422-line type model), released (commit `45f3b5a release(genesis): v2.19.0 Identity Capability`), documented (`src/genesis/identity/README.md` "(v2.19)"), and tested (`tests/genesis-identity.test.ts`, 1,205 LOC, 236 assertions). Test `describe` titles show committed work through **v2.24** (Decision Engine). The roadmap is six milestones behind the code (DOC-004).

**Readiness: NOT READY** — but the obstacle is not identity code.

| Requirement | Status |
| :--- | :--- |
| Identity graph, evidence, confidence, evolution services | **Present and unit-tested** — genuinely good work |
| Identity receives reality to form beliefs from | **Blocked** — CRIT-002 |
| Identity survives a session | **Blocked** — CRIT-004; `InMemoryIdentityRepository` only |
| Identity reaches the companion's awareness snapshot | **Blocked** — `identityObservations: []` is hard-coded (GEN-010) |
| `IdentityValidationService` compiles | **No** — calls `repository.findEvidence()`, absent from the interface |
| `IdentityRepository` has a durable implementation | **No** |

An identity model that cannot observe the user and forgets everything on reload is a type system, not a capability. **Fix CRIT-002 and CRIT-004 before declaring v2.19 complete**, and add an `SqliteIdentityRepository`. The identity *logic* needs no rework.

### Future Observability Platform

**Readiness: NOT READY — and the groundwork is in a worse state than "absent".**

`src/observability/` is 34 files and 3,242 LOC with 11 architecture documents and ADR-021 behind it. It has 12 type errors including 4 imports of `telemetry-service` files that do not exist, and **zero inbound imports from any non-observability file**. `src/diagnostics/` has 7 missing modules in a 104-line manager. Meanwhile the application logs through 192 `console.*` calls and two byte-identical duplicate loggers, with a third (the official one) unused and non-compiling.

The path forward is to make it compile and adopt it in one narrow place first (replace `console.*` in the instrumentation write path, where PLT-007's swallowed failures would immediately become visible), rather than to build more of it.

### TITAN

**Readiness: BLOCKED — on a decision, not on code.**

Correctly absent per the brief; its absence is not a defect. But two problems must be resolved before it can be specified:

1. **Two irreconcilable definitions exist in the repository.** The brief says "Capability Architecture Layer — detect capability gaps, analyse existing capabilities, design module architectures, produce capability blueprints, plan dependencies and permissions." `ROADMAP.md` §2.2 and `ARCHITECTURE.md` §6 say "TITAN Background Processor — a standardized service worker queue for sync actions and backups." These are different systems. One canon must be retired (DOC-003).
2. **TITAN's job is to design capabilities against the Capability Registry, Manifest System and Permission Framework.** All three exist and are good; none is adopted (BND-007); the Permission Framework performs no authorization (SEC-005). TITAN would be designing blueprints for a runtime that has never loaded a module.

**Prerequisite: adopt the Platform Runtime for at least one real module**, so that manifests, dependency resolution, lifecycle and capability binding are validated against reality. That is the missing input to TITAN, and it is item 4's natural follow-on.

### FORGE

**Readiness: BLOCKED — correctly, and further out than TITAN.**

Also correctly absent. Same canon conflict (`ROADMAP.md` §3.2 defines it as a shell-script sandbox; the brief defines it as code generation/testing/packaging/installation).

FORGE generates code, tests it, packages it and installs it. Every one of those four verbs depends on something currently missing:

| FORGE needs | Current state |
| :--- | :--- |
| A gate to verify generated code compiles and passes tests | **None** — CRIT-007 |
| A typed SDK to generate against | **`unknown` × 9**, does not compile — DEP-005/006 |
| A module format to package into | Manifest system exists, **never used** — BND-007 |
| A sandbox to install into safely | **None** — unsandboxed `await import()` of arbitrary paths, `manifest.startup` can be absolute — SEC-001 |
| Permissions to constrain generated modules | **No authorization** — SEC-005 |

There is a sharp irony worth stating plainly: **CRIT-001 exists because generated code was committed without a build gate.** FORGE is an autonomous code generator. Building it before item #1 lands would industrialise the exact failure mode this audit found.

### Third-party modules

**Readiness: NOT READY. Do not open this surface.**

| Requirement | Status |
| :--- | :--- |
| Module manifest format + validation | **Ready** — genuinely good (`manifest-schema.ts`, `manifest-validator.ts`) |
| Dependency resolution + ordering | **Ready** — deterministic, cycle-detecting |
| Capability registry | **Ready** — multi-provider, semver-filtered |
| Lifecycle management | **Ready in design** — but `IModuleInstance` omits `definition` (DEP-009) and per-module timeouts are undeclarable because the schema is `strictObject` (DEP-010) |
| **Permission enforcement** | **ABSENT** — `require()` checks catalog membership only, has zero call sites, and `ModuleContext` exposes no permission object (SEC-005) |
| **Sandboxing** | **ABSENT** — `await import()` with full Node privileges; `manifest.startup` honours absolute paths, escaping the module directory (SEC-001) |
| **SDK type contract** | **ABSENT** — 9 service types are `unknown`; 16 `as any` casts (DEP-006) |
| **SDK error contract** | **BROKEN** — every error becomes `PermissionRequiredError` at 16 sites (DEP-005) |
| **SDK version compatibility** | **BROKEN** — exact string equality, so `sdkVersion: "^1.0.0"` is meaningless |
| Manifest parsing robustness | **WEAK** — hand-rolled YAML parser silently discards structured content, defeating `strictObject`'s unknown-key rejection (PLT-021) |
| Module isolation validated against a real module | **NEVER** — zero production consumers (BND-007) |

**Assessment:** shipping third-party modules today would give any module full filesystem access, the SQLite connection, and the user's plaintext API keys, with no permission check and no diagnosable errors. The four *hard* problems (manifest, resolution, registry, lifecycle) are solved and solved well. The remaining work — a grant model, a sandbox, real SDK types, and honest error propagation — is smaller than what is already built, and it is all that stands between this and a genuinely good module platform.

---

## Closing note

The recurring pattern in this audit is not carelessness. It is that **every subsystem in AKIRA was built to a high standard in isolation, and the connections between them were never verified.** The Platform Runtime is excellent and unused. The Event Store is correct and disconnected from the cognitive layer that needs it. The identity model is well designed and cannot remember anything. The tests for the platform were thoughtfully written and assert nothing. The documentation describes all of it as working.

That is a very specific failure mode, and it has a very specific remedy: **make the connections observable.** A CI gate, a converted test suite, one event bus, and durable cognitive state — in that order — turn AKIRA from a collection of good designs into the system those designs describe.

Architecture is not successful because it looks good in documentation. It is successful when the running code obeys it. AKIRA's architecture is worth obeying; the code has not yet been asked to.
