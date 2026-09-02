# 10 — Performance Audit

Every item is labelled:

- **MEASURED BOTTLENECK** — observed with numbers, in this repository, during this audit.
- **POTENTIAL RISK** — a mechanism whose cost grows with data or usage, not yet measured.
- **PREMATURE OPTIMIZATION** — something that looks slow but should be left alone.

No optimisation is recommended without evidence.

---

## 1. What was actually measured

### 1.1 Event Store ingest throughput — the repository's only real benchmark

`src/instrumentation/tests/benchmark.test.ts` produced the following on this machine during `npx vitest run` (Windows 11, Node 24.18.0, `better-sqlite3` 12.11.1, WAL mode):

| Events | Total time | Throughput | Avg latency | p95 latency | Max latency | Heap growth |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 55.8 ms | 17,909 ev/s | 0.055 ms | 0.102 ms | 7.50 ms | 5.11 MB |
| 10,000 | 821.9 ms | 12,166 ev/s | 0.082 ms | 0.165 ms | 10.11 ms | 0.92 MB |
| 50,000 | 2,212.6 ms | 22,598 ev/s | 0.044 ms | 0.109 ms | 5.20 ms | 5.16 MB |

**Assessment: the write path is healthy and not a bottleneck.** Sub-0.2 ms p95 at 12–22k events/sec is far beyond anything a single-user desktop app will generate. Throughput does not degrade with volume (the 50k run was the fastest per-event), and heap growth is bounded — no accumulation across runs.

**One important consequence for correctness, not performance:** at 12–22 events per *millisecond*, the millisecond-resolution `timestamp` column guarantees ordering collisions. That is why PLT-006 (non-deterministic query ordering) and PLT-015 (rebuild watermark skipping same-ms events) are real defects rather than edge cases. **This benchmark is the evidence for those two findings.**

### 1.2 Build and transform cost

```
npx vite build   →  ✓ 2,329 modules transformed  (then failed on the unresolved import, DEP-001)
```
2,329 modules for a single-user desktop app is large. The dominant contributor is identifiable: `src/routes/__root.tsx` imports `@/genesis`, a barrel with 61 outbound imports that transitively pulls all 208 GENESIS files — including `planning` (36 files), `identity` (17), `understanding` (15) and the AI providers — into the **client** graph (BND-003).

No bundle-size figure could be obtained because the build does not complete. That measurement should be taken immediately after DEP-001 is fixed.

### 1.3 Test-suite import cost

Full run: `Duration 4.59s (transform 9.73s, import 17.08s, tests 1.03s, environment 8ms)`.
Single suite, cold: `Duration 498ms (transform 233ms, import 264ms, tests 36ms)`.

**Actual test execution is 1.03 s of a 4.59 s wall-clock run.** 17 s of cumulative import time (parallelised) is spent loading module graphs. This is the same barrel problem: a test importing one GENESIS service pulls the whole layer, plus the nine import-time `initialize()` side effects (BND-004).

**Assessment: MEASURED, but low-impact today.** 4.6 s is a fine suite time. It is worth recording because it confirms the barrel-graph cost quantitatively, and because the ratio (17× more time importing than testing) will worsen as GENESIS grows.

### 1.4 Lint and typecheck cost

`npx tsc --noEmit` and `npx eslint .` both complete in a few seconds on 373 source files. No performance concern.

---

## 2. POTENTIAL RISKS — mechanisms that scale badly

### PERF-001 — Startup hydration loads the entire database into memory

`src/persistence/store-init.ts` → `getInitialState()` calls, unconditionally and without pagination:

```ts
const projects     = projectRepository.getAll();      // SELECT * FROM projects ORDER BY created_at DESC
const tasks        = taskRepository.getAll();         // SELECT * FROM tasks ORDER BY created_at ASC
const notes        = noteRepository.getAll();         // SELECT * FROM notes ORDER BY pinned DESC, favorite DESC, updated_at DESC
const sessions     = sessionRepository.getAll();      // SELECT * FROM sessions ORDER BY started_at DESC
const vaultFiles   = vaultFileRepository.getAll();    // SELECT * FROM vault_files ORDER BY created_at DESC
const vaultFolders = vaultFolderRepository.getAll();  // SELECT * FROM vault_folders ORDER BY name ASC
```

Nine `getAll()` methods across the repositories issue unbounded `SELECT *` with no `LIMIT`. The entire result is serialised over the RPC boundary and placed in `akira-store`'s single `state` object, which every `useAkira` selector reads on every store emission.

**Growth profile:** notes carry full rich-text `content`; sessions accumulate one row per focus timer; vault files accumulate one row per upload. A user two years in with a few thousand notes transfers and holds all of it on every page load.

**Classification: POTENTIAL RISK.** Correct and fast today (a fresh database hydrates instantly). It is the single most likely future startup bottleneck, and the fix — paginate notes/sessions, load vault metadata lazily — is straightforward. **Do not act on this yet;** measure `getInitialState()` duration against a realistically populated database first.

### PERF-002 — `ConsistencyChecker` materialises the whole Event Store

`src/analytics/validation/consistency-checker.ts:38`
```ts
const allEvents = this.eventRepository.findBetween(0, Date.now() * 2);
```
Every event ever recorded is loaded into a JS array, then grouped into a `Map<string, any[]>` — roughly two full copies in memory. `RebuildManager` (`rebuild-manager.ts:63`) does the same for the tail since the last watermark, plus an in-memory `Array.sort`.

**Scale estimate from measured data:** the benchmark shows ~5 MB heap growth per 50,000 event *writes*. A read-all-plus-group of 365,000 events (one year at 1,000/day) is on the order of hundreds of megabytes of JS objects. `EventRepository` exposes no streaming, cursor, or paged API — `latest(limit)` is the only bounded read.

**Classification: POTENTIAL RISK.** `checkConsistency()` has no production caller today. If it is ever wired to a UI button, it will OOM on a mature database.

### PERF-003 — Understanding-graph rebuild is quadratic in memory count

`src/genesis/understanding/engine.ts:50-70` — `rebuildGraph()` re-filters **all** memories and **all** stories and calls `buildUnderstandingGraph(memories, stories, understandings)` on *every* promoted memory and *every* story event. Ingesting N memories therefore performs N full rebuilds over up to N items. `insightEngine` subscribes to `understandingEngine`, so each rebuild cascades into insight re-derivation.

**Classification: POTENTIAL RISK, currently masked.** Because GENESIS receives almost no events (BND-001) and retains nothing across sessions (GEN-002), N stays near zero and this has never been exercised. **It becomes the first real bottleneck the moment memory ingestion is fixed**, and it should be measured as part of that work rather than pre-optimised now.

### PERF-004 — Prompt assembly grows without bound

`src/genesis/context/ai/prompt-builder.ts` appends six blocks with no cap, slice, or token budget (GEN-006; `grep -n "slice(0,\|MAX_\|limit\|budget\|token"` → no matches). `getInsightContext` documents itself as *"Mode A (Stable: **all** insights)"*; `getUnderstandingContext` joins all understandings after category filtering; `[AVAILABLE PROJECTS]` lists every project.

**Cost profile:** every AI request pays for the full accumulated cognitive history in input tokens, on every turn. The failure mode is a provider 400 for exceeding the context window.

**Classification: POTENTIAL RISK.** Same masking as PERF-003. This is the one item on this list that is a *cost* problem as well as a latency problem, and it must be addressed in the same change that fixes GEN-002 — not after.

### PERF-005 — `AnalyticsEngine.startScheduler` has no re-entrancy guard

`src/analytics/engine/AnalyticsEngine.ts:241-252`
```ts
this.schedulerIntervalId = setInterval(() => {
  try { this.runFullAggregation(); } catch (err) { console.error(…); }
}, intervalMs);
```
`runFullAggregation()` iterates every date and every project, calling `aggregateDay()`/`aggregateProject()` — each of which performs its own `findBetween` scan and resets all calculators. If one pass exceeds `intervalMs`, passes overlap and contend for the same SQLite write lock, feeding directly into REL-002's spin-wait.

**Classification: POTENTIAL RISK.** `startScheduler` has no production call site today.

### PERF-006 — Missing index on `vault_file_tags.tag_id`

`vault_file_tags` has `PRIMARY KEY (file_id, tag_id)` and no separate index on `tag_id`. The garbage-collection trigger runs on every tag unlink:
```sql
CREATE TRIGGER trg_vault_file_tags_cleanup AFTER DELETE ON vault_file_tags
BEGIN
  DELETE FROM vault_tags WHERE id = old.tag_id
    AND NOT EXISTS (SELECT 1 FROM vault_file_tags WHERE tag_id = old.tag_id);
END;
```
SQLite can use the composite PK index only for a `file_id`-leading lookup, so `WHERE tag_id = ?` is a full scan of the link table.

**Classification: POTENTIAL RISK, trivially fixable.** Negligible at a few hundred links. Recorded because it is the only genuine index gap found — every other table is well indexed (see §4).

---

## 3. MEASURED BOTTLENECK — one, and it is a correctness bug too

### PERF-007 — Synchronous spin-wait blocks the server event loop for up to ~15 seconds

Fully documented as REL-002. Restated here because it is the only place in the codebase where a *deliberate* performance decision is wrong.

`src/persistence/repositories/SqliteSearchRepository.ts:36-40`
```ts
const sleepTime = delay * Math.pow(2, attempt);   // 100, 200, 400 ms
const start = Date.now();
// Synchronous spin sleep suitable for Node.js worker/SSR environment
while (Date.now() - start < sleepTime) { /* wait */ }
```

Cost accounting, from the code:
- `connection.ts:42` sets `busy_timeout = 5000`, so each `fn()` attempt already blocks up to 5 s inside SQLite before raising `SQLITE_BUSY`.
- 3 attempts × 5,000 ms = 15,000 ms of blocked event loop.
- Plus 100 + 200 = 300 ms of **CPU-burning spin** between attempts (400 ms is computed on the final attempt but not used, since `attempt < retries` fails).

During that window the single-threaded Node process serves no other RPC, no SSR render, and no HTTP request. Applied to `SqliteSearchRepository.search()` — the hot path behind the Command Palette and the universal search bar.

Directly contradicts `ARCHITECTURE.md` §2.4: *"No Event Loop Blocking: Heavy tasks … are handled asynchronously on the server."*

**This is the one performance change worth making on evidence alone**, and it is cheap: drop the wrapper (SQLite's own `busy_timeout` already handles contention) or make it async with `await new Promise(r => setTimeout(r, …))`.

---

## 4. PREMATURE OPTIMIZATION — leave these alone

| Item | Why not to touch it |
| :--- | :--- |
| SQLite index coverage | 22 indexes across 12 tables, and they match the actual query patterns: `idx_tasks_project_id`, `idx_tasks_done_completed`, `idx_notes_pinned_favorite`, `idx_sessions_started_at DESC`, `idx_timeline_timestamp DESC`, `idx_timeline_project_event (project_id, event_type)`, `idx_vault_files_hash` (dedup lookup), 5 Event Store indexes. This is careful, deliberate work. |
| FTS5 + trigger-driven index maintenance | `fts_workspace` with `tokenize = 'porter unicode61'` and 18 triggers keeping it current on insert/update/delete for projects, tasks, notes, sessions and timeline events. Correct design; search is O(index), not O(table). |
| `SqliteTimelineRepository.findPaged` keyset pagination | Composite `(timestamp, id)` cursor with correct `<`/`>` tie-breaking in both directions. Better than offset pagination and already O(log n). Do not "simplify" it. |
| `SearchManager` result cache | 5 s TTL, 50-entry cap with oldest-first eviction. Modest and appropriate; its only defect is invalidation correctness (DAT-006), not performance. |
| `EventBus` `Set` iteration | O(subscribers) with 2 subscribers. Nothing to gain. |
| `crypto.randomUUID()` for all ids | Fast, collision-free, no dependency. |
| `useSyncExternalStore` + selectors | Correct React 19 pattern for an external store. Re-render cost is bounded by selector granularity, and no re-render problem was observed or reported. |
| WAL + `auto_vacuum = INCREMENTAL` | Correct PRAGMA choices for a single-writer local app. |
| `@tanstack/react-virtual` in the timeline | Virtualisation already present where lists are unbounded. |
| Stream-based SHA-256 hashing in the vault | `VaultHashService.generateHashFromStream` avoids loading whole files into memory. Correct. |
| Lazy `await import()` in RPC handlers | ~40 sites. These exist to keep `better-sqlite3` out of the client bundle, not for speed. Removing them would break the client build. |

---

## 5. Not measurable in this audit

| Item | Why | How to measure later |
| :--- | :--- | :--- |
| Cold/warm startup time | `vite build` fails (DEP-001), and starting `vite dev` mutates the real `akira.db` (dev seeding, `initializeDatabase`) — out of scope for a read-only audit | After DEP-001: time `getInitialState()` server-side and `performance.mark` around `akira.initializeState` |
| Client bundle size | Build does not complete | `vite build` + `rollup-plugin-visualizer`; expect the GENESIS barrel to dominate (BND-003) |
| Event Store growth on disk | No populated production database was inspected | `SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()` plus `SELECT COUNT(*) FROM events`; the schema stores `payload_json` as TEXT with no compression |
| Timeline reconstruction time | `timelineService.initialize()` is a no-op in the browser and has no server-side production caller (see `11-code-quality.md` QUA-006) | Benchmark `findPaged` against 100k `timeline_events` rows |
| Context-building latency | The path is starved of input (BND-001), so any measurement today would read ~0 | Instrument `buildSystemInstruction` for wall time and output length once GEN-001/GEN-002 are fixed |
| Module load time | No modules exist to load (BND-007) | Applies once the runtime is adopted |

---

## Performance verdict

**One measured bottleneck (PERF-007), one measured strength (the Event Store write path), and no evidence of any other real slowness today.**

The honest summary is that AKIRA is not currently slow, and most of its scaling risks are hidden by the fact that its two largest subsystems are not receiving data (BND-001, GEN-002) or not being executed (BND-007). Three of the six potential risks — PERF-002, PERF-003, PERF-004 — will surface *as a direct consequence* of fixing those wiring defects, which means the remediation plan for GEN-001/GEN-002 must include a token budget and a bounded rebuild strategy, not just the wiring.

Fix PERF-007 now. Measure PERF-001 against real data. Design PERF-003 and PERF-004 into the GENESIS persistence work. Leave everything in §4 exactly as it is.
