# 07 — Reliability & Failure Audit

Method: for each failure mode, the actual code path was traced to the point where the error is either handled, surfaced, or discarded.

Baseline measurement: `grep -rn "console\." src --include=*.ts --include=*.tsx | wc -l` → **192**. Of the 26 `catch` handlers that produce no user-visible signal, 16 discard the error entirely.

---

## REL-001 — CRITICAL — The application cannot start; there is no gate that would have caught it

**Evidence:** `npx vite build` fails with `[UNRESOLVED_IMPORT] Could not resolve '../health/createHealthRuleEngine'`, on the **client** hydration path (DEP-001, BND-003). `npx tsc --noEmit` reports 103 errors across 39 files.

**Why it reached `main`:** `.github/` contains only `CODEOWNERS`. There are no workflow files, no pre-commit hooks (`.git/hooks` holds only samples), no `typecheck` script in `package.json`, and `npm run lint` is configured to report formatting only (see TST-001 / QUA-001). Nothing in the repository would have failed on this commit.

**Reliability meaning:** the project has no mechanism that distinguishes "compiles and runs" from "does not". Every finding in this document should be read against that background.

---

## REL-002 — CRITICAL — Synchronous spin-wait blocks the server event loop for up to 15 seconds

**Location:** `src/persistence/repositories/SqliteSearchRepository.ts:23-46`
```ts
private executeWithRetry<T>(fn: () => T, retries = 3, delay = 50): T {
  let attempt = 0;
  while (attempt < retries) {
    try { return fn(); }
    catch (err: any) {
      attempt++;
      const isLocked = err?.code === "SQLITE_BUSY" || err?.message?.includes("busy") || err?.message?.includes("locked");
      if (isLocked && attempt < retries) {
        const sleepTime = delay * Math.pow(2, attempt);      // 100, 200, 400 ms
        const start = Date.now();
        // Synchronous spin sleep suitable for Node.js worker/SSR environment
        while (Date.now() - start < sleepTime) { /* wait */ }   // ← busy loop
        continue;
      }
      throw err;
    }
  }
  throw new Error("Maximum database retry attempts exceeded");
}
```

**Failure scenario:** a vault upload holds a write lock. A search RPC arrives. `better-sqlite3` already blocks for `busy_timeout = 5000` before raising `SQLITE_BUSY` (`connection.ts:41`). This retry wrapper then spins the CPU for 100 ms, calls `fn()` again → another 5,000 ms block → spins 200 ms → third attempt → another 5,000 ms block. Worst case ≈ **15.3 seconds during which the Node.js event loop is fully occupied**, spending 700 ms of it burning CPU. Every other RPC, every SSR render and the HTTP server itself are stalled. The user sees a completely frozen application.

The comment asserting this is "suitable for Node.js worker/SSR environment" is incorrect — TanStack Start's server entry is single-threaded and the RPC does not run in a worker.

**Direct contradiction of stated architecture:** `ARCHITECTURE.md` §2.4, *"No Event Loop Blocking: Heavy tasks … are handled asynchronously on the server."*

**Aggravating factor:** the retry is layered on top of SQLite's own `busy_timeout`, so it multiplies an already-generous wait by 3 rather than adding fast jitter.

**Blast radius:** `SqliteSearchRepository.search()` (line 50) and one other method (line 202) — the two hottest read paths, driven by the Command Palette and the universal search bar.

---

## REL-003 — HIGH — Every write failure in the workspace is invisible

See DAT-001. Reliability framing: 36 mutation sites dispatch `import(...).then(svc => svc.write(...))` with 0 `.catch()` and 0 `await`. A rejected promise inside a `.then` callback becomes an **unhandled rejection**:
- In the browser: `unhandledrejection`, surfaced only in the devtools console.
- If this path ever executes during SSR: Node's default `--unhandled-rejections=throw` (Node 15+) **terminates the process**.

There is no retry queue, no offline buffer, no reconciliation on reconnect, and no user-visible error. The application's failure mode for "the database write did not happen" is "appear to succeed, then quietly forget".

---

## REL-004 — HIGH — Self-sustaining event amplification loop in the presence path

**The loop, as wired:**

```
presenceService.initialize()
  └─ akira.subscribe(() => { rebuild PresenceContext; if changed → eventBus.publish(PRESENCE_UPDATED) })
                                                                        │
eventBus."*" ── genesis/events/event-service.ts:94 ─────────────────────┘
  └─ case Events.PRESENCE_UPDATED → this.record("presence_updated", …)
       └─ saveMemory(event) → akira.set(s => ({ …s, memories: [event, …s.memories] }))
            └─ emit() → the presence store subscriber fires again ───────┐
                                                                        │
       resolveInputsFromStore() reads state.memories[0].timestamp ←──────┘
         → lastEventTemporalReference changes → new presenceConfidence
```

**Why it terminates today (and only just):** `calculatePresenceConfidence` and `calculateContinuityConfidence` (`src/akira-os/presence/rules.ts:88-109`) round to 2 decimals via `Number((…).toFixed(2))`, and `isContextChanged` compares those rounded values. When a memory is recorded, `lastEventTime` jumps to ~now, so `idleTime → 0` and `presenceConfidence → 1.0`; the next comparison sees no change and the cascade stops after 1–2 iterations.

**The damping is accidental, not designed.** Remove the rounding, add any field to `isContextChanged` that varies continuously with `Date.now()`, or make any downstream write touch the store, and the loop becomes unbounded. There is no cycle detection, no re-entrancy guard, and no event-depth limit anywhere in either bus.

**Corroborating evidence that this has already bitten:** `src/shared/infrastructure/event-bus/index.ts:71` excludes exactly one event type from the instrumentation bridge, with no explanation:
```ts
if (eventType !== "presence.updated") { publish({ … }); }
```
The exclusion was applied at the bridge instead of at the source, so the memory-recording branch of the loop remains live.

**Independent of the loop:** the decay timer (`presence/service.ts:175`, 30 s interval) means that while the app is open, `presence_updated` memory events accumulate on every rounded-confidence change. Combined with GEN-001 this is the *only* growing input to the cognitive pipeline.

---

## REL-005 — HIGH — Errors are swallowed at every subscriber boundary in both event buses

| Boundary | Handling | Consequence |
| :--- | :--- | :--- |
| `shared/infrastructure/event-bus/index.ts:48-66` | `try { sub(event) } catch (e) { console.error(...) }` per subscriber, for both direct and `"*"` subscribers | A throwing subscriber cannot fail the publish; the publisher gets no signal |
| `shared/infrastructure/event-bus/index.ts:68-79` | `import(...).then(...).catch(() => {})` | Every instrumentation-bridge failure discarded (PLT-005) |
| `instrumentation/event-bus.ts:29-40` | `try/catch` sync + `result.catch(console.error)` async | Event persistence failures reported only to the console (PLT-007) |
| `genesis/events/event-service.ts:62-70` | `try { localPersistHandler(event) } catch { console.error }`, then `try { saveMemory(event) } catch { console.error }` | Event is published to subscribers even when persistence failed → in-process state diverges from the (would-be) durable record |
| `genesis/candidate/candidate-service.ts:69-75` | `try { listener(candidate) } catch { console.error }` | A failing validator does not stop candidate generation |
| `genesis/memory/memory-service.ts:71-77` | same | A failing story/understanding listener does not stop memory promotion |
| `genesis/stories/story-service.ts:117-123` | same | — |
| `genesis/understanding/engine.ts:75-81` | same | — |

**Pattern-level risk:** a partial failure anywhere in the cognitive chain leaves the chain in an inconsistent state with the only evidence in a console the user never opens. There is no error event, no health flag, no dead-letter queue, and no aggregation. `src/observability/` exists precisely to solve this and is unwired (BND-007 / QUA-004).

---

## REL-006 — HIGH — `publish()` throws into the middle of a state reducer

**Location:** `src/persistence/akira-store.ts` — 17 `publish({...})` calls, several of them *inside* the `set((s) => {...})` updater body, e.g. lines 248-258 and 269-277:
```ts
set((s) => {
  …
  publish({ type: "task.completed", source: "tasks-store", payload: { …, projectId: t.projectId }, version: 1 });
  …
  return { ...s, tasks: nextTasks };
});
```

On the client, `publish()` runs `defaultMiddlewarePipeline`, which **throws** on a non-serialisable payload (PLT-008), a blank `type`/`source`, or a missing `version`. That throw propagates out of the updater, out of `set()`, and into the UI event handler — after `emit()` has not yet run and `state` has not been reassigned.

**Failure scenario:** a payload field is `undefined` → `serializationValidator` throws → `set()` never assigns → **the user's action is silently reverted with an uncaught exception**, and (because `set` is not wrapped) the React error boundary in `__root.tsx` renders "Application Interruption".

**Secondary concern:** side effects inside a state updater are re-executed if the updater is ever invoked more than once. `akira-store` uses a hand-rolled `set` (not React's `useReducer`), so this is not triggered by StrictMode today, but the pattern is a duplicate-event hazard for any future refactor toward React state.

---

## REL-007 — MEDIUM — Startup: database initialisation failure does not stop the server

See DAT-008. `src/server.ts` catches `initializeDatabase()` failures, logs, and continues serving. There is no health endpoint, no readiness gate, and no degraded-mode signalling. Every subsequent RPC fails individually against an uninitialised schema.

---

## REL-008 — MEDIUM — Boot ordering is implicit and one failure silently disables seven subsystems

See GEN-013. `src/routes/__root.tsx`'s second `useEffect` calls ten `initialize()`/`bootstrap()` methods in sequence with no `try/catch`. `companionStateService.bootstrap()` is third and **throws** if presence is not initialised:
```ts
if (!presenceContext) throw new Error("Cannot bootstrap Companion State: Presence Engine is not initialized.");
```
A throw at position 3 prevents `goalService`, `knowledgeService`, `relationshipService`, `habitService`, `reflectionService`, `contextResolutionService` and `initiativeService` from ever initialising — and the cleanup function returned by the effect never registers, so the four things `bootstrap()` already started (`validationEngine`, `recallBuilder`, `memoryService`, `identityFoundationService`) are never disposed (GEN-014).

The user-visible symptom is the generic React error boundary. There is no indication that the cognitive layer is offline.

---

## REL-009 — MEDIUM — Resource leaks: 7 intervals, inconsistent teardown

| Timer | Location | Cleared? |
| :--- | :--- | :--- |
| Presence decay, 30 s | `akira-os/presence/service.ts:175` | Yes — `shutdown()` called from `__root.tsx` cleanup |
| Analytics scheduler | `analytics/engine/AnalyticsEngine.ts:245` | `stopScheduler()` exists; **no production caller of either** |
| Diagnostics collector | `diagnostics/core/diagnostics-manager.ts:53` | Module does not compile (7 missing imports) |
| Gemini mock stream, 40 ms | `genesis/context/ai/providers/gemini-provider.ts:227` | Yes — cleared on abort and on completion |
| OpenRouter mock stream | `providers/openrouter-provider.ts:217` | Yes |
| Upload queue ×2 | `hooks/useUploadQueue.ts:67,92` | Inside `useEffect` — needs verification per-hook |

**Additional leak paths:**
- `AnalyticsEngine.startScheduler(intervalMs)` calls `runFullAggregation()` inside `setInterval` with no re-entrancy guard. `runFullAggregation` iterates every date and project and calls `aggregateDay`/`aggregateProject`, each doing a `findBetween` scan. If one run exceeds `intervalMs`, runs overlap and compete for the same write lock — feeding REL-002.
- `memoryService` and `identityFoundationService` have `initialize()` but no `dispose()`, so the `bootstrap()`/`closeSession()` pair is asymmetric.
- The nine import-time `initialize()` calls (BND-004) can never be torn down at all; their subscriptions live for the lifetime of the module graph.

---

## REL-010 — MEDIUM — Invalid external input is unvalidated at every RPC entry

See PLT-001: 40 of 41 `.validator()` calls are identity functions. Failure behaviour for malformed input is therefore whatever the repository does:
- `SqliteProjectRepository.add({ name: 42 })` → `input.name.trim is not a function` → a raw `TypeError` returned as an h3 500.
- `settingsService.set({ key: null, value: {} })` → `INSERT` with a null primary key → `SQLITE_CONSTRAINT`.
- `getRawFileBase64Rpc` and `uploadMockFileServerRpc` are the only two that reject malformed input cleanly, because they use `zod`.

`src/server.ts:30-46` (`normalizeCatastrophicSsrResponse`) catches h3's `{"unhandled":true,"message":"HTTPError"}` shape and renders an error page — a genuinely thoughtful piece of work, but it converts *every* backend fault into the same opaque 500 page.

---

## REL-011 — MEDIUM — Corrupted persisted data is handled inconsistently

| Read path | On malformed data |
| :--- | :--- |
| `SqliteEventRepository.mapRowToEvent` | `try/catch` around `JSON.parse`; logs `"Database Corruption: Malformed payload JSON for event {id}"` and substitutes `{}` — **good** (row survives, corruption is named) |
| `RebuildManager.rebuildIncremental` | Catches a repository-level throw and falls back to raw row-by-row streaming with per-row `try/catch` and an `errorCount` — **good**, though `isCompleted: true` still masks it (PLT-016) |
| `SqliteTimelineRepository.mapRowToEvent` | Bare `JSON.parse(row.payload)` — **no guard**; one malformed row throws out of `findPaged`, which is caught at line 155 and degrades the *entire* query to the in-memory fallback queue only |
| `store-init.ts` | 5 × unguarded `JSON.parse(settingsRepository.get(...))` for `active_session`, `profile`, `last_project_id`, `chat`, `streaks`. One corrupt settings blob throws inside `getInitialState()` → hydration fails → `toast.error` and the app runs forever on `seed()` data |
| `provider-manager.loadConfig` | Per-key `try/catch` with `*Parsed` flags, and refuses to mark `configLoaded` if any key failed — **good** |
| `migration-impl.executeMigration` | JSON parse guarded, per-field array-shape validated, schema version checked — **best in the repo** |

**Risk:** the two unguarded paths are the ones that gate application startup and the timeline view. A single corrupt `settings` row permanently reverts the user to seed data with only a toast to explain it.

---

## REL-012 — MEDIUM — Provider failure: no retry, no circuit breaker, and a silent mock fallback

**Location:** `src/genesis/context/ai/providers/{gemini,openrouter}-provider.ts`

```ts
const apiKey = aiProviderManager.getApiKey("Gemini");
if (!apiKey) {
  console.warn("VITE_GEMINI_API_KEY is not defined. Using mock fallback mode for development.");
  // …returns a hard-coded fabricated reply, streamed word-by-word
}
```
The mock reply is a plausible-looking assistant message containing invented data ("Focus 65% → 90%", "Calm 4/10 → 8/10", "You have N active stories"). Nothing in the returned `StandardAIResponse` marks it as synthetic, and the only signal is a `console.warn`.

**Failure scenario:** a user's key is cleared (or was never set, or `saveConfig` was aborted by the `configLoaded` guard). The companion continues to respond with fabricated content that reads as real analysis of the user's life. For a product whose stated value is truthful self-reflection (`docs/GENESIS/architecture/companion-core/09-companion-transparency.md`), this is a correctness *and* trust failure, not just a dev convenience.

Additionally: no retry on transient HTTP failure, no exponential backoff, no circuit breaker, and no timeout on the real `fetch` calls — a hung provider connection hangs the chat indefinitely (abort is available only via a user-supplied `AbortSignal`). Rate limiting is detected and turned into a message string (`provider-manager.ts:482`) but not into a backoff.

---

## REL-013 — LOW — Cascading-failure surface is small, by accident

There is no work queue, no cross-service transaction, and no fan-out beyond the two event buses, so a single fault cannot currently cascade far. This is a property of the system being *unwired* (BND-007: no modules, no runtime, no scheduler running), not of deliberate bulkheading. Adopting the Platform Runtime, enabling `AnalyticsEngine.startScheduler`, or fixing GEN-001 will each expand this surface, and none of the boundaries above (per-subscriber catch, spin-wait retry, un-awaited writes) are ready for it.

---

## Failure-mode matrix

| Failure | Detected? | Surfaced to user? | Recoverable? |
| :--- | :--- | :--- | :--- |
| Database unavailable at startup | Logged | No | No — server runs broken (REL-007) |
| Database locked during a write | Yes, at the repository | No (workspace writes) / partial (timeline) | Spin-retry blocks the loop (REL-002); timeline silently buffers (DAT-004) |
| Workspace write RPC rejects | No | No | No — data silently lost (REL-003) |
| Event handler throws | Logged only | No | Other subscribers proceed; state diverges (REL-005) |
| Event fails serialisation validation | Throws, then swallowed | No, or a full UI crash if inside `set()` | Event permanently lost (PLT-008, REL-006) |
| Event Store insert fails | Logged only | No — RPC returns success | No (PLT-007) |
| Module initialisation fails | Throws | React error boundary only | No — 7 sibling services never start (REL-008) |
| Missing dependency / missing file | Build fails | Build fails | Yes, once someone runs the build (REL-001) |
| AI provider missing key or failing | `console.warn` | **No — fabricated content returned** | Silent degradation (REL-012) |
| Corrupted event payload JSON | Yes, named in the log | No | Yes — row preserved with `{}` payload |
| Corrupted settings JSON | Throws | `toast.error` | No — app runs on seed data (REL-011) |
| Corrupted timeline payload JSON | Throws, caught broadly | No | Whole query degrades to the fallback queue (REL-011) |
| Unexpected shutdown | n/a | n/a | Workspace: yes if writes landed. Cognitive state: **total loss** (GEN-002) |
| Vault commit failure after file move | No | No | No — orphan or dangling reference (DAT-003) |

---

## What is reliable and should not be changed

| Mechanism | Why |
| :--- | :--- |
| `src/server.ts` error normalisation | `normalizeCatastrophicSsrResponse` specifically detects h3's swallowed-throw shape (`{"unhandled":true,"message":"HTTPError"}`), recovers the real error via `consumeLastCapturedError()`, and renders a proper HTML error page. Genuinely hard-won knowledge, correctly encoded. |
| `__root.tsx` error boundary | Copy-to-clipboard diagnostics, stack trace gated behind `localStorage["akira:dev_mode"]`, and a `router.invalidate() + reset()` recovery action. Good UX under failure. |
| `withTimeout` in the lifecycle manager | Every lifecycle hook is time-bounded (`runtime/lifecycle/lifecycle-timeout.ts`). The mechanism is correct; only its per-module configuration is unreachable (DEP-010). |
| `SQLITE_BUSY` detection logic | Correctly checks `err.code`, `"busy"` and `"locked"`. Only the *waiting* strategy is wrong (REL-002). |
| `provider-manager.saveConfig` overwrite guard | Explicitly refuses to overwrite non-empty stored API keys with an empty in-memory config, and refuses to save before `configLoaded`. Prevents a real data-loss race. |
| Event Store pre-write validation | Serialisability, timestamp validity and version integrality are all checked before `INSERT`, with specific error messages. |
| `AbortSignal` support in AI streaming | Both providers check `signal?.aborted`, clear their intervals, record the cancellation metric, and reject with a proper `DOMException("Aborted", "AbortError")`. |
