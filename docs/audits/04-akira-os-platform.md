# 04 — AKIRA OS Platform Audit

Scope: Foundation (Repository Pattern, RPC, Validation, module boundaries), Instrumentation (Event Bus, Event Store, Timeline), Analytics, Platform Runtime, Platform SDK.

Stated milestone under audit: **AKIRA OS v1.8.2 — Stability Release — architecture considered stable.**

---

## 4.1 Foundation

### PLT-001 — HIGH — The "Validation Framework" does not exist at the RPC boundary

**Finding:** AKIRA OS exposes **53 `createServerFn` handlers** with **41 `.validator(...)` calls**. Exactly **one** performs runtime validation. The other 40 are identity functions whose only effect is to satisfy TypeScript.

**Evidence:**
```
grep -c "createServerFn"                    → 53
grep ".validator(" | grep -c "z\."          →  1
grep ".validator(" | wc -l                  → 41
```
Representative shapes:
```ts
// src/akira-os/vault/server/index.ts:6
.validator((input: { name: string; parentId: string | null }) => input)
// src/akira-os/settings/server/index.ts:44
.validator((input: { key: string; value: string }) => input)
// src/instrumentation/server/index.ts:7
.validator((input: any) => input)
// src/persistence/migration.ts:11
.validator((d: string) => d)
```
The only real validators are `getRawFileBase64Rpc` (`z.object({ id: z.string() })`) and `uploadMockFileServerRpc` (`z.object({ name, mime, folderId, content })`), both in `src/akira-os/vault/server/index.ts`.

**Risk:** every RPC handler is an HTTP endpoint that accepts arbitrary JSON. The TypeScript parameter annotations are erased at build time, so `persistUpdateProject({ data: { id: 42, patch: { progress: "🚀" } } })` reaches `Sqlite*Repository` unchecked. `zod` is already a dependency and is used correctly in `src/runtime/manifest/manifest-schema.ts` — the pattern is known to the team and simply not applied here.

**Note on scope:** because this is a local-first single-user app, the realistic consequence is data corruption from client bugs rather than a remote attacker. The security dimension is covered separately in `09-security-audit.md` (SEC-004).

---

### PLT-002 — MEDIUM — Repository Pattern is respected by feature modules and bypassed by the analytics/validation subsystem

**Respected:** all 8 feature modules go client-facade → RPC → repository. `src/contracts/repositories/` defines 11 interfaces with matching `Sqlite*Repository` implementations. `better-sqlite3` is imported in only 8 files.

**Bypassed — raw `db.prepare` outside the repository layer:**

| File | Raw SQL sites |
| :--- | ---: |
| `src/analytics/validation/rebuild-manager.ts` | 5 |
| `src/analytics/validation/analytics-validator.ts` | 5 |
| `src/analytics/validation/benchmark.ts` | 6 |
| `src/analytics/validation/consistency-checker.ts` | 1 |
| `src/instrumentation/server/index.ts` | 1 |
| `src/akira-os/vault/VaultStorageService.ts` | 2 (`db.transaction`) |

`RebuildManager.rebuildAll()` issues `DELETE FROM daily_metrics`, `DELETE FROM project_metrics`, `DELETE FROM analytics_state` directly, and `rebuildIncremental()` keeps a raw `SELECT * FROM events` fallback path. `AnalyticsRepository` has no method for either.

**Risk:** the two subsystems that *verify* derived-data correctness are the two that do not go through the abstraction they are verifying. Table names and column shapes are now duplicated in the validation layer, so a schema change breaks the checker silently.

---

### PLT-003 — MEDIUM — Schema management has no version ladder; `schema_version` is decorative

**Finding:** `src/persistence/initializer.ts` records exactly one version — `1` — and then performs feature detection:

```ts
versionStmt.run(1, new Date().toISOString());          // only ever version 1
…
if (!timelineTableCheck) { db.exec(/* inline DDL */) }  // "Dynamic Migration"
if (!searchHistoryCheck) { db.exec(/* 150 lines of DDL + 18 triggers */) }
if (!vaultTableCheck)    { db.exec(/* 90 lines of DDL + 8 triggers */) }
```

**Corroborating evidence:** `src/persistence/migrations/002_file_vault.sql` (5,564 bytes) exists on disk and is referenced by **no TypeScript file** (`grep -rn "002_file_vault\|migrations/" src scripts` → no matches). The same DDL was copy-pasted inline into `initializer.ts`.

**Risk:**
- Column-level changes are unreachable. `if (!tableExists)` cannot add a column to an existing table, so a schema evolution on any of the 5 detected tables requires manual intervention on every user's database.
- No downgrade path, no migration log, no way to tell whether a given database is at the intended shape.
- Two sources of truth for the vault schema that can drift apart silently.

---

### PLT-004 — MEDIUM — Module boundaries are not enforceable

`DIRECTORY_STRUCTURE.md` §3 promises build-time enforcement:

> "Imports to database prepared statements from any file loaded by the browser (such as components) will throw an import-boundary error at build-time."

`vite.config.ts` disables exactly that mechanism:
```ts
tanstackStart: { server: { entry: "server" }, importProtection: { enabled: false } }
```

Actual enforcement is 4 hand-written runtime guards:
`persistence/connection.ts:2`, `persistence/initializer.ts:2`, `akira-os/vault/VaultValidationService.ts:1`, `akira-os/vault/VaultStorageService.ts:1`.

`eslint.config.js` contains one `no-restricted-imports` rule, and it is about the Next.js `server-only` package — not about layer boundaries. There is no `dependency-cruiser`, no eslint boundaries plugin, and no CI (`.github/` contains only `CODEOWNERS`).

**Risk:** the four guards are the entire boundary. Adding a fifth server-only file without remembering the guard leaks `better-sqlite3` into the client bundle and produces an opaque browser error.

---

## 4.2 Instrumentation

### PLT-005 — HIGH — Two event systems coexist with a one-way, lossy, silently-failing bridge

See BND-001 for the architectural consequence. The mechanism itself has independent defects:

**Location:** `src/shared/infrastructure/event-bus/index.ts:64-80`
```ts
publish<T>(eventType: string, payload: T): void {
  … notify direct subscribers … notify "*" subscribers …
  try {
    import("../../../instrumentation")
      .then(({ publish }) => {
        if (eventType !== "presence.updated") {
          publish({ type: eventType, source: this.deriveSourceFromEventType(eventType), payload: payload || {}, version: 1 });
        }
      })
      .catch(() => {});          // ← every failure discarded
  } catch { /* ignore */ }
}
```

Defects:
1. **Fire-and-forget with a blackhole catch.** A rejected dynamic import or a rejected `publish` is unobservable. Events silently never reach the Event Store.
2. **Ordering is not preserved.** The forward is asynchronous (`.then`), so events forwarded from the legacy bus can be persisted out of publication order relative to events published directly on the instrumentation bus.
3. **`presence.updated` is silently excluded** with no comment explaining why. The exclusion strongly suggests a past event-amplification incident (see REL-004) that was patched at the bridge instead of at the source.
4. `deriveSourceFromEventType` invents `source` values (`projects-legacy-bus`, `tasks-legacy-bus`, …) so provenance in the Event Store is synthetic.

---

### PLT-006 — HIGH — Event ordering is not deterministic in the Event Store

**Finding:** `events.timestamp` is stored as `INTEGER` milliseconds (`src/instrumentation/event-store/schema.ts:6`). Only `latest()` adds a tiebreaker.

| Query | ORDER BY | Deterministic? |
| :--- | :--- | :--- |
| `latest(limit)` | `timestamp DESC, rowid DESC` | Yes |
| `findByType(type)` | `timestamp DESC` | **No** |
| `findBySource(source)` | `timestamp DESC` | **No** |
| `findByCorrelationId(id)` | `timestamp DESC` | **No** |
| `findBetween(a, b)` | `timestamp ASC` | **No** |

**Why this bites:** the measured ingest rate from `src/instrumentation/tests/benchmark.test.ts` is **12,166–22,598 events/sec**, i.e. 12–22 events per millisecond. Same-millisecond collisions are the norm, not an edge case.

**Blast radius:** `findBetween` is the input to `AnalyticsEngine.aggregateDay()`, `RebuildManager.rebuildIncremental()` and `ConsistencyChecker.checkConsistency()`. Any calculator whose result depends on event order (session start/end pairing, state transitions) can produce different values on identical data.

**Available fix material:** the table has a monotonic `rowid`, and `latest()` already uses it. There is no sequence column in the schema.

---

### PLT-007 — HIGH — A failed persistence write is swallowed and reported as success

**Finding:** the write path has no error propagation to the caller.

Chain: `Publisher.publish()` → `EventBus.publish()` → each subscriber in a per-subscriber `try/catch`.

`src/instrumentation/event-bus.ts:29-40`
```ts
publish(event: AkiraEvent): void {
  for (const subscriber of this.subscribers) {
    try {
      const result = subscriber.onEvent(event);
      if (result instanceof Promise) {
        result.catch((error) => console.error(`[EventBus] Async subscriber "${subscriber.id}" failed:`, error));
      }
    } catch (error) {
      console.error(`[EventBus] Synchronous subscriber "${subscriber.id}" failed:`, error);
    }
  }
}
```

`PersistenceSubscriber.onEvent` calls `repository.insert(event)`, which **throws** on: missing payload, non-serialisable payload/metadata, invalid timestamp, non-integer version, and duplicate primary key. All of those become a `console.error` and `persistPublishEvent` returns `processedEvent` — a success response.

**Risk:** the Event Store is the claimed immutable source of truth for Timeline and Analytics rebuilds. It can silently lose events while the UI shows the action as completed.

---

### PLT-008 — HIGH — Serialisation validation rejects ordinary payloads, and the rejection is invisible

**Finding:** `isSerializable` (`src/instrumentation/event.ts`) rejects any `undefined` value **anywhere** in the payload:

```ts
if (val === undefined) return { serializable: false, reason: "Value is undefined" };
…
for (const key of Object.keys(val)) {
  const res = isSerializable(val[key], visited);
  if (!res.serializable) return { serializable: false, reason: `Object property "${key}": ${res.reason}` };
}
```
It also rejects `Map`, `Set`, `RegExp`, `Promise`, `NaN`, `Infinity`, and **any object with a non-`Object.prototype` prototype** (i.e. every class instance).

**Failure scenario:** `publish({ type: "task.completed", payload: { id, title, projectId: task.projectId } })` where `projectId` is `undefined` (an unassigned task) → `serializationValidator` middleware throws inside `Publisher.publish()` → on the client this propagates out of `publish()` into `akira-store.set()`'s reducer body; on the server it is caught by `EventBus.publish`'s per-subscriber catch. Either way the event never lands.

`src/persistence/akira-store.ts:270` does exactly this:
```ts
publish({ type: "task.completed", source: "tasks-store",
          payload: { id: t.id, title: t.title, projectId: t.projectId }, version: 1 });
```
`Task.projectId` is `string | null` in `store-types.ts`, and `addTask` sets `projectId: null` — so this specific site is safe. But nothing enforces the convention, and the validator's contract (`undefined` is fatal, `null` is fine) is documented nowhere.

**Risk:** a strict validator combined with a swallowing bus produces silent, data-dependent event loss. This is the most likely mechanism by which the Event Store diverges from reality in production.

---

### PLT-009 — MEDIUM — No cross-subscriber transaction; Event Store and Timeline can diverge

**Finding:** two subscribers write to two tables with no shared transaction:
- `PersistenceSubscriber` → `INSERT INTO events`
- `TimelineSubscriber` → `timelineRepository.insert` → `INSERT INTO timeline_events`

`EventBus.publish` iterates them independently, catching each failure. `TimelineSubscriber.onEvent` even re-throws (`src/instrumentation/subscribers/timeline-subscriber.ts:52`), which only feeds the bus's `.catch`.

**Failure scenario:** an event with a payload containing `undefined` is rejected by `PersistenceSubscriber` (PLT-008) but accepted by `TimelineSubscriber` (which does no such validation) → the Timeline shows an event that the Event Store has no record of → the next analytics rebuild cannot reproduce it, and `ConsistencyChecker` will report a permanent mismatch that no rebuild can fix.

---

### PLT-010 — MEDIUM — Event immutability is conventional, not enforced

`AkiraEvent` is a plain interface. Middleware creates new objects via spread (`{ ...event, id }`), which is good, but the final event object is passed **by reference** to every subscriber and is never `Object.freeze`d. `TimelineSubscriber` shallow-copies the payload (`{ ...(event.payload as any) }`) — nested objects are still shared.

**Risk:** a subscriber (including a future third-party module subscriber) can mutate `event.payload.someObject` and change what later subscribers and the Event Store observe. Ordering of `Set` iteration then determines data. For a system whose central claim is an immutable event log, this deserves a `Object.freeze` (deep) at the end of the middleware pipeline.

---

### PLT-011 — MEDIUM — `correlationId` is auto-generated per event, making correlation queries meaningless

**Location:** `src/instrumentation/middleware/index.ts:36-41`
```ts
export const correlationIdGenerator: Middleware = (event) =>
  event && !event.correlationId ? { ...event, correlationId: generateUUID() } : event;
```
No call site anywhere in `src/` supplies a `correlationId`. Therefore every event gets a unique one, `idx_events_correlation_id` indexes a near-unique column, and `findByCorrelationId()` returns exactly one row by construction.

**Risk:** the primary tool for tracing a user action across subsystems is inert. `05`/`07` findings that would be diagnosable via correlation are not.

---

### PLT-012 — MEDIUM — Client and server both run the middleware pipeline; version coercion loses data

**Finding:** `publish()` runs `defaultMiddlewarePipeline` on the client (`src/instrumentation/publisher.ts:47`) and `persistPublishEvent` runs it again on the server (`src/instrumentation/server/index.ts:52`). Idempotent for id/timestamp/correlationId (all guarded by `!event.x`), but the validator accepts `version` as a *string* while the schema column is `INTEGER` and the repository coerces:

```ts
const versionInt = typeof event.version === "number" ? event.version : parseInt(event.version as string, 10);
```
`version: "1.2"` → `1` (silent truncation). `version: "v2"` → `NaN` → throws → swallowed by PLT-007.

**Risk:** event schema versioning — the mechanism that will let payloads evolve — silently loses precision and can silently drop events.

---

### PLT-013 — MEDIUM — Subscriber registration is a per-request scan-and-register hack

**Location:** `src/instrumentation/server/index.ts:16-50`. On **every** event RPC the handler dynamically imports 5 modules, reads the private `globalEventBus.subscribers` set, string-matches subscriber ids, and registers `PersistenceSubscriber`/`TimelineSubscriber` if absent.

Problems:
1. Reaches into a `private` field (DEP-008) while `hasSubscriber()` exists unused.
2. `subsArray` is snapshotted once, before either registration, then reused for the second check — correct today only because the two ids differ.
3. There is no server-side startup wiring at all: `src/server.ts` calls only `initializeDatabase()`. `EventService.start()` (`src/instrumentation/event-store/event-service.ts`), which exists precisely to register the persistence subscriber, is never called from production code.
4. Under concurrent first requests, two handlers can both observe `hasPersistence === false` and register two `PersistenceSubscriber`s → every subsequent event is inserted twice → primary-key violation on the second insert → swallowed (PLT-007). Net effect: noisy logs, and a real duplicate risk for `timeline_events` where ids also collide.

---

## 4.3 Analytics

### PLT-014 — HIGH — Rebuild and consistency-check bucket by UTC; live query paths bucket by timezone

**Finding:** two different day-bucketing rules coexist.

| Path | Bucketing | Location |
| :--- | :--- | :--- |
| Live query / activity timeline | `clockService.getBucketKey(ts, offsetMinutes, unit)` | `analytics/engine/AnalyticsEngine.ts:356`, `analytics/service/query-service.ts:246`, `analytics/metrics/calculators.ts:364,386` |
| Stored daily aggregate | UTC midnight boundaries | `AnalyticsEngine.aggregateDay()` — `new Date(\`${date}T00:00:00.000Z\`)` |
| Rebuild day-key derivation | `event.timestamp.substring(0, 10)` — UTC | `analytics/validation/rebuild-manager.ts:138` |
| Consistency check day-key | `event.timestamp.substring(0, 10)` — UTC | `analytics/validation/consistency-checker.ts:45` |

**Failure scenario:** a user at UTC+5:30 completes a task at 02:00 local on the 5th (= 20:30 UTC on the 4th). `daily_metrics` credits it to the 4th. `compileActivityTimeline(offset = 330)` credits it to the 5th. `getTodaySummary(330)` reads `daily_metrics` and reports a different number than the activity chart rendered beside it. `ConsistencyChecker` compares its UTC recomputation against a UTC table, so it reports *consistent* while the user-visible numbers disagree.

**Risk:** derived data is correct only for UTC users. The validator cannot detect the class of error it exists to detect.

---

### PLT-015 — HIGH — Incremental rebuild permanently skips same-millisecond events

**Location:** `src/analytics/validation/rebuild-manager.ts:53-57`
```ts
const state = this.analyticsRepository.getRebuildState();
let startMs = 0;
if (state?.lastProcessedTimestamp) {
  startMs = new Date(state.lastProcessedTimestamp).getTime() + 1;   // ← +1 ms
}
```
State is saved from `events[events.length - 1]` after sorting by `timestamp.localeCompare` — which, per PLT-006, is not a total order within a millisecond.

**Failure scenario:** events E1…E5 all carry timestamp `T`. The sort returns them in arbitrary order; suppose E3 lands last. State records `T`. The next run starts at `T + 1`, so E4 and E5 (whichever they are) are **never processed**. Their `dateKey`/`projectId` are also never added to `uniqueDates`/`uniqueProjects`, so their day is never re-aggregated either. At 12–22 events/ms this is guaranteed, not theoretical.

---

### PLT-016 — MEDIUM — `isCompleted: true` is returned even when the rebuild partially failed

`RebuildProgress` carries both `isCompleted` and `errorCount`, and `rebuildIncremental` always sets `isCompleted: true` on the return path regardless of `errorCount`. There are 5 separate `catch` blocks that increment `errorCount` and continue (corrupt row skip, envelope pre-process, per-day aggregate, per-project aggregate).

**Risk:** callers cannot distinguish a clean rebuild from one that dropped 40% of days. The state row is nevertheless advanced to the last event, so the skipped days will not be retried.

---

### PLT-017 — MEDIUM — Unbounded in-memory event loading

| Call | Location |
| :--- | :--- |
| `findBetween(startMs, Date.now() * 2)` — whole event tail into an array | `rebuild-manager.ts:63` |
| `findBetween(0, Date.now() * 2)` — the **entire** Event Store into an array | `consistency-checker.ts:38` |

Both then build additional `Map`/`Set` structures over the result. `RebuildManager` also sorts the array in memory.

**Measured context:** the Event Store benchmark shows ~5 MB heap growth per 50,000 events written. A user-year of activity at even 1,000 events/day is ~365k events; `checkConsistency()` would materialise all of them plus a `Map<string, any[]>` grouping. `EventRepository` exposes no streaming or paged API.

Classification: **POTENTIAL RISK** (not a measured bottleneck — see `10-performance-audit.md`).

---

### PLT-018 — LOW — `rebuildAll` wipes derived tables outside the rebuild transaction

`rebuildAll()` commits `DELETE FROM daily_metrics / project_metrics / analytics_state` in its own transaction, then calls `rebuildIncremental()` which is not transactional. A crash in between leaves analytics empty. It self-heals on the next run (no state row → `startMs = 0` → full rebuild), so severity is low, but the window shows zeros to the user with no indication why.

---

## 4.4 Platform Runtime

**This subsystem is the best-engineered code in the repository, and it is connected to nothing.** See BND-007: zero inbound imports from production code; all five consumers are test files.

### Genuine strengths (do not refactor)

| Component | Why it is good |
| :--- | :--- |
| `manifest/manifest-schema.ts` | Real `z.strictObject` schema; strict semver and semver-range regexes; unknown keys rejected |
| `manifest/manifest-validator.ts` | Maps zod issues onto a typed error hierarchy (`MissingFieldError`, `InvalidVersionError`, `UnknownPropertyError`, `DuplicateModuleError`, `DuplicateCapabilityError`, `DuplicateRouteError`) |
| `resolver/dependency-resolver.ts` | Deterministic: manifests sorted by id before graph construction; explicit missing-dependency and cycle detection with typed errors; produces `startupOrder` + `shutdownOrder` |
| `registry/capability-registry.ts` | Multi-provider per capability, pluggable `CapabilitySelector` (priority strategy), semver-range filtering, distinct `CapabilityNotFoundError` vs `CapabilityVersionMismatchError`, deterministic tie-break by `providerModule.localeCompare` |
| `module-state.ts` + `isValidTransition` | Explicit state machine guarding lifecycle transitions |
| `lifecycle/lifecycle-timeout.ts` | `withTimeout` wrapper applied to every lifecycle hook |

### PLT-019 — HIGH — The Permission Framework performs no authorization

**Finding:** `PermissionManager` (`src/runtime/permissions/permission-manager.ts`) only answers "does this permission id exist in the static catalog?". It holds no grants, consults no per-module grant set, and has no `grant`/`revoke`/`isGrantedTo` API.

```ts
public require(permissionId: string): PermissionDescriptor {
  const perm = this.catalog.get(permissionId);
  if (!perm) throw new PermissionNotFoundError(permissionId);
  return perm;                     // ← "the permission exists", not "you may use it"
}
```

**Evidence of inertness:** the only three references to it in `src/runtime/runtime-manager.ts` are the import (line 4), the field declaration (line 29) and the construction (line 47). `require()` has **zero call sites in production code**. `ModuleContext` (`src/runtime/module-context.ts:29-34`) exposes `logger`, `eventBus`, `configuration`, `runtime` — and no permission object, so a module could not check a permission even if it wanted to.

`PermissionCatalog` (152 lines) enumerates permissions with descriptors; `permission-errors.ts` defines a typed error. The scaffolding is complete; the decision function is absent.

**Risk:** for third-party modules — the reason the framework exists — a manifest's `permissions: [...]` array is documentation. Any loaded module has the same authority as the host process.

### PLT-020 — HIGH — Module loading is unsandboxed arbitrary code execution, and `manifest.startup` can escape the module directory

**Location:** `src/runtime/module-loader.ts:70-97`
```ts
if (fileStat?.isDirectory()) {
  if (resolvedManifest && resolvedManifest.startup) {
    entryFile = path.isAbsolute(resolvedManifest.startup)
      ? resolvedManifest.startup                        // ← absolute path honoured
      : path.join(normalizedPath, resolvedManifest.startup);
  }
  …
}
const importTarget = `file:///${entryFile.replace(/\\/g, "/")}`;
moduleExports = await import(importTarget);             // ← full Node privileges
```
There is no allowlist, no path confinement to the module directory (a relative `startup` of `../../../x.js` is also unchecked), no signature or integrity check, no VM/worker isolation, and no capability gating (PLT-019).

Detailed attack path in `09-security-audit.md` (SEC-001).

### PLT-021 — MEDIUM — The hand-rolled YAML parser silently discards content it cannot model

**Location:** `src/runtime/manifest/manifest-loader.ts:11-114` — a 100-line "lightweight, zero-dependency YAML parser" used to read untrusted third-party manifests.

**Probes executed** (isolated test, removed afterwards; production code unmodified):

| Input | Output | Assessment |
| :--- | :--- | :--- |
| `__proto__:\n  polluted: true\nid: evil` | `Object.prototype.polluted === undefined` | **No prototype pollution** — assigning `__proto__` replaces the local object's prototype, so writes are scoped. Checked and clear. |
| `description: "AKIRA: the OS"` | `{"description":"AKIRA: the OS"}` | Correct — colons in values are handled |
| `permissions:\n  - id: a\n    scope: read\n  - id: b` | `{"permissions":["id: a","id: b"]}` | **Confirmed silent data loss** — `scope: read` is discarded entirely and list items degrade to raw strings |

**Risk today:** LOW-to-MEDIUM. `ModuleManifestSchema` currently types `permissions`/`dependencies`/`capabilities` as `z.array(z.string())`, so the flat-string degradation happens to match the schema. **But** the parser drops unparseable lines (`if (colonIndex === -1) continue;`) rather than erroring, which means `z.strictObject`'s `UnknownPropertyError` protection is unenforceable for YAML manifests: an unknown key inside a structure the parser can't model simply vanishes before validation sees it.

**Future risk:** HIGH. The moment the manifest schema needs a structured list (dependency version ranges, permission scopes, capability versions), YAML manifests will be silently mangled and then pass validation. `ManifestLoader.discover()` compounds this by swallowing every error (`catch {}`) and pushing `{ manifest: null }` entries.

### PLT-022 — MEDIUM — Capability bindings are module definitions, not capability implementations

`src/runtime/lifecycle/lifecycle-manager.ts:217-241` auto-registers each `manifest.capabilities[i]` with `instance.definition` as the bound instance. `ModuleDefinition` (`module-instance.ts:20-27`) declares only `name`, `version`, `startup`, `shutdown`, `pause`, `resume`.

So `runtime.resolveCapability<SomeCapability>("search.provider")` returns the module's *lifecycle definition object*, typed as `SomeCapability`. A consumer calling `capability.search(...)` gets `undefined is not a function`. Additionally, all auto-registered capabilities receive `priority: 100`, making the priority selector's tie-break (`providerModule.localeCompare`) the only differentiator.

### PLT-023 — LOW — `CapabilityRegistry.isReady` is write-only

`setReady()` sets the flag; nothing reads it. `register()` also stores `undefined` when called without an instance, and `resolve()` will happily return that `undefined` after publishing a `CapabilityEvents.RESOLVED` event.

---

## 4.5 Platform SDK

| Question | Answer |
| :--- | :--- |
| Public API clarity | Only `AkiraSDK` and `SDK_VERSION` are exported from `src/sdk/index.ts`. Clear surface. |
| Internal API leakage | `PermissionAPI` exists but is exported from nowhere and never instantiated by `AkiraSDK` — dead. |
| API consistency | Consistent: 8 namespaces, each a thin wrapper with `permissions.require(...)` then delegate. |
| **Error contracts** | **Broken** — every error becomes `PermissionRequiredError` (DEP-005, 16 sites). |
| **Type contracts** | **Absent** — all 9 service types are `unknown`; 16 `as any` casts; 18 `TS2571` errors (DEP-006). |
| Versioning | `SDKVersionMismatchError` is thrown on `context.runtimeVersion !== SDK_VERSION` — an **exact-equality** check, so a `sdkVersion: "^1.0.0"` manifest range is meaningless; `1.0.1` runtime rejects a `1.0.0` SDK. |
| Extensibility | No plugin/extension point; adding a namespace requires editing `AkiraSDK`'s constructor and 8 private fields. |
| Buildability | `src/sdk/core/akira-sdk.ts:1` imports `./core/sdk-context` — a path that does not exist (`TS2307`). It works at runtime only because the import is type-only and gets elided. |

**Risk:** the SDK is presented as the stable contract that lets modules evolve independently of the platform. In its current state it provides neither type checking, nor meaningful version compatibility, nor usable error information. This is the single largest gap between AKIRA OS's documented posture ("v1.8.2 Stability Release") and its code.

---

## Platform verdict

| Area | State |
| :--- | :--- |
| Repository Pattern | Solid in feature modules; bypassed in analytics validation |
| RPC Layer | Structurally clean and consistent across 8 modules |
| Validation Framework | Effectively absent at the RPC boundary (1 of 41) |
| Module boundaries | Not enforceable; build-time protection explicitly disabled |
| Event Bus | Two of them; the bridge is one-way, async and silent |
| Event Store | Correct schema and indexes; non-deterministic ordering; failures swallowed |
| Timeline | Good keyset pagination; unflushed in-memory fallback queue (see `06`) |
| Analytics | Sophisticated and self-validating, but UTC/local split makes the validator blind |
| Manifest / Resolver / Registry / Lifecycle | **High quality — the best code in the repo** |
| Permission Framework | Catalog only; performs no authorization |
| Platform SDK | Untyped, mis-versioned, error-erasing, non-compiling |

"Architecture considered stable" is defensible for the *shapes* — the layering intent, the RPC/repository split, and the runtime's internal design are sound and worth preserving. It is not defensible for the *wiring*: the runtime is unadopted, the SDK is unusable, permissions are inert, and the application does not build.
