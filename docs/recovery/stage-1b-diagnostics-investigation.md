# Stage 1B — Diagnostics Subsystem Investigation

**Baseline:** [`stage-1b-diagnostics-baseline.md`](stage-1b-diagnostics-baseline.md)
**HEAD:** `b561730` · **Source modifications in this investigation: none.**

---

## 1. Executive Summary

The 7 remaining errors are not damage. They are the visible edge of an **abandoned draft**.

`src/diagnostics/` was created on **2026-07-24** in commit `45f3b5a` as 4 files that reference 11 modules — 6 of which were never written. **One day later, on 2026-07-25**, commit `5297517` introduced `src/observability/` (34 files, 11 architecture documents, ADR-021), whose specification explicitly claims *"Metrics, Logs, Traces, **Diagnostics, Health**, Auditing, and **Resource Monitoring**"* — precisely the scope of the abandoned draft. `src/diagnostics/` was never touched again.

Three independent facts establish that `src/diagnostics/` is stale rather than incomplete-but-mandated:

1. **It is documented nowhere.** No ADR, no `DIRECTORY_STRUCTURE.md` entry, no `ARCHITECTURE.md` mention, no `MODULE_CONTRACT.md` reference. `grep -rn "src/diagnostics" docs *.md` returns matches only inside my own audit and recovery reports.
2. **Every one of its 6 missing modules has a documented home inside `src/observability/`** — assigned by name in `docs/AKIRA-OS/architecture/observability/PACKAGE_STRUCTURE.md` (§5.2 below).
3. **Its successor already models the data it was trying to produce.** `HealthRecord` (with `healthStatus: "healthy" | "degraded" | "critical"`), `ResourceRecord` (CPU, RSS, heap, event-loop lag, disk), `DiagnosticRecord`, and factory methods `createHealth` / `createResource` / `createDiagnostic` all exist and compile.

So the errors do not indicate lost work to recover. They indicate a **duplicate subsystem that lost a race**, still referencing scaffolding that was never built because the functionality moved.

**Two things this investigation also establishes, which matter more than the 7 errors:**

- The 7 errors are **inert**. `src/diagnostics/` has zero importers, is unreachable from every entry point, and the production build passes at exit 0 with them outstanding. They block `tsc` and nothing else.
- The successor is **also unwired**. `src/observability/` has **zero external consumers**, `RuntimeVisibility` (its own facade) is imported by nothing, and 7 of its 17 documented packages — including `health/`, `resources/` and `exporters/` — do not exist. Deleting the stale draft would make `tsc` green while leaving AKIRA with no working diagnostics capability. That is the architectural decision this report escalates.

---

## 2. Error Inventory

All 7 errors, all in `src/diagnostics/core/diagnostics-manager.ts` (104 lines).

| # | Line | Error | Symbol | Specifier |
| ---: | ---: | :--- | :--- | :--- |
| 1 | 3 | `TS2307` | `HealthChecker` | `../health/health-checker` |
| 2 | 4 | `TS2307` | `PerformanceMonitor` | `../performance/performance-monitor` |
| 3 | 5 | `TS2307` | `StartupProfiler` | `../performance/startup-profiler` |
| 4 | 6 | `TS2307` | `DiagnosticsExporter` | `../reporting/diagnostics-exporter` |
| 5 | 8 | `TS2307` | `MetricsCollector` | `../metrics/metrics-collector` |
| 6 | 9 | `TS2307` | `EventMetrics` | `../metrics/event-metrics` |
| 7 | 101 | `TS2693` | `DiagnosticError` | interface used as a constructor |

### How each missing symbol is actually used

This is what constrains any recovery — the *entire* observable contract of the 6 missing modules:

| Symbol | Constructed as | Methods called | Return shape required |
| :--- | :--- | :--- | :--- |
| `HealthChecker` | `new HealthChecker()` | `.evaluate(report)` | `{ warnings, errors, healthScore }` |
| `PerformanceMonitor` | `new PerformanceMonitor()` | **none** | — |
| `StartupProfiler` | `new StartupProfiler()` | `.markStart()`, `.duration()` | `number` (ms) |
| `DiagnosticsExporter` | `new DiagnosticsExporter()` | `await .export(report, "json")` | `void` / `Promise<void>` |
| `MetricsCollector` | **never constructed** | **none** | — |
| `EventMetrics` | `new EventMetrics(runtimeAdapter)` | `.record(name)`, `.snapshot()` | `{ eventsPerSecond }` |

Two of six (`PerformanceMonitor`, `MetricsCollector`) have **no observable contract at all**. `MetricsCollector` is imported and never referenced anywhere in the file.

### Error 7 in context

```ts
} catch (e) {
  // Translate any unexpected error
  const err = new DiagnosticError();   // ← interface, not a class; `err` never used
}
```
`src/diagnostics/core/diagnostics-report.ts` declares `DiagnosticError` as `interface { code: string; message: string }`. `src/diagnostics/core/diagnostics-errors.ts` declares a **class** `DiagnosticsError` (plural) requiring `message: string`. Neither would make this line meaningful: the value is discarded inside an empty catch. This is placeholder text, not code.

### Additional non-compiler defects found in the same file

Not `tsc` errors, but relevant to any decision to complete rather than remove:

| Line | Observation |
| ---: | :--- |
| 74-78 | `moduleCount: 0, // placeholder – would be filled via other collectors`; `runningModules: 0`, `failedModules: 0`, `capabilities: 0`, `permissions: 0` all hard-coded zero |
| 83 | `healthScore: 100` hard-coded before `HealthChecker` overwrites it |
| 39 | `const bus = (this.context.runtimeAdapter as any).events as any;` — double `any` cast to reach the event bus |
| 41-46 | Subscribes to `"module.lifecycle"`, `"capability.register"`, `"permission.grant"`, `"runtime.error"` — **none of these strings exists** in `src/contracts/events.ts`, `LifecycleEvents`, or `CapabilityEvents`. The real constants are `runtime.module.loaded`, `runtime.capability.registered`, etc. **All four subscriptions would silently never fire.** |
| 53 | `setInterval` imported from `"timers"` — a Node-only import in a file with no server-only guard |
| 99-102 | `catch (e) { const err = new DiagnosticError(); }` — errors silently discarded |

---

## 3. Architecture Map

### 3.1 Three independent things named "Diagnostics"

Discovered by full-repository symbol census. They are unrelated implementations, not layers of one design.

| | **A — Runtime Diagnostics** | **B — Observability Diagnostics** | **C — Analytics Diagnostics** |
| :--- | :--- | :--- | :--- |
| Location | `src/diagnostics/` | `src/observability/diagnostics/` | `src/analytics/validation/diagnostics.ts` |
| Files | 4 | 2 | 1 |
| Added | 2026-07-24 (`45f3b5a`) | 2026-07-25 (`5297517`) | 2026-07-24 (`45f3b5a`) |
| Responsibility | Periodic collection of runtime metrics → health scoring → `RuntimeReport` → export | Report a registered diagnostic **code** through the telemetry pipeline as an immutable `DiagnosticRecord` | Report analytics-subsystem health: schema validity + Event-Store↔derived-table consistency |
| Compiles | **No** — 7 errors | **Yes** (after Stage 1A path fixes) | **Yes** |
| Importers | **0** | **0** | 2 (`analytics/validation/index.ts`, `analytics/tests/analytics.test.ts`) |
| Reachable at runtime | **No** | **No** | Yes, via the analytics barrel |
| Test coverage | **None** | **None** | Indirect — `src/analytics/tests/analytics.test.ts`, which is a hand-rolled script contributing **0 assertions** under vitest |
| Documented | **Nowhere** | ADR-021 + 11 observability docs | `docs/adr/ADR-015-analytics-reliability.md`, `docs/platform/ANALYTICS.md` |

`DiagnosticsService` is a name collision: **B** and **C** both export a class with that name, and they share no interface.

### 3.2 Subsystem A — actual dependency graph (`src/diagnostics/`)

```
DiagnosticsManager                      src/diagnostics/core/diagnostics-manager.ts
  │  (constructed by: NOBODY)
  │
  ├──► DiagnosticsContext               core/diagnostics-context.ts          ✅ compiles
  │      └──► RuntimeAdapter            ../../compatibility/interfaces/…     ✅ (Stage 1A fix)
  │
  ├──► RuntimeReport                    core/diagnostics-report.ts           ✅ compiles
  ├──► DiagnosticWarning                core/diagnostics-report.ts           ✅
  ├──► DiagnosticError (interface)      core/diagnostics-report.ts           ⚠️ used as a value
  │
  ├──► HealthChecker                    ../health/health-checker             ❌ never written
  ├──► PerformanceMonitor               ../performance/performance-monitor   ❌ never written
  ├──► StartupProfiler                  ../performance/startup-profiler      ❌ never written
  ├──► DiagnosticsExporter              ../reporting/diagnostics-exporter    ❌ never written
  ├──► MetricsCollector                 ../metrics/metrics-collector         ❌ never written
  └──► EventMetrics                     ../metrics/event-metrics             ❌ never written

  DiagnosticsError (class)              core/diagnostics-errors.ts           ⚠️ 0 importers
        └── + MetricCollectionError, ExporterError, HealthCalculationError
            — error types for the three modules that were never written
```

**5 of 11 dependencies resolve. 6 do not. 0 consumers.**

The three orphaned error classes in `diagnostics-errors.ts` are themselves evidence of intent: `MetricCollectionError`, `ExporterError` and `HealthCalculationError` exist for exactly the collector, exporter and health-checker that were never built.

### 3.3 Subsystem B — actual dependency graph (`src/observability/`)

```
RuntimeVisibility  (facade)             src/observability/runtime-visibility.ts
  │  (imported by: NOBODY)
  ├──► Logger / LoggerRegistry          logging/                   ✅
  ├──► TraceService                     tracing/                   ✅
  └──► DiagnosticsService               diagnostics/               ✅
         ├──► AbstractTelemetryService  services/                  ✅
         ├──► telemetryFactory          services/telemetry-factory ✅
         ├──► DiagnosticsValidator      validation/                ✅
         ├──► DiagnosticRegistry        diagnostics/               ✅  (code allowlist, regex-validated)
         └──► DiagnosticRecord          models/record.ts           ✅

  models/record.ts also declares:  MetricRecord · LogRecord · TraceRecord ·
                                   AuditRecord · DiagnosticRecord ·
                                   HealthRecord · ResourceRecord      ✅ all compile
  telemetryFactory:                createDiagnostic · createHealth ·
                                   createResource                     ✅ all exist
```

### 3.4 Documented vs actual observability packages

`docs/AKIRA-OS/architecture/observability/PACKAGE_STRUCTURE.md` specifies 17 packages. Verified against the filesystem:

| Package | Status | Documented responsibility |
| :--- | :--- | :--- |
| `api/` | ✅ 1 file | Public facades |
| `contracts/` | ✅ 1 | Shared contracts |
| `models/` | ✅ 5 | Immutable telemetry records |
| `services/` | ✅ 7 | Facade orchestration |
| `metrics/` | ✅ 6 | Metric tracking & aggregation |
| `logging/` | ✅ 2 | Structured logger |
| `tracing/` | ✅ 2 | Spans & context propagation |
| `diagnostics/` | ✅ 2 | System diagnostics dumper |
| `events/` | ✅ 1 (`export {}` stub) | EventBus integration subscribers |
| `utils/` | ✅ 2 | Clock, id generator |
| **`health/`** | ❌ **missing** | **"Health Rules Engine — component health registrations and health check evaluation"** |
| **`resources/`** | ❌ **missing** | **"Physical Resource Trackers — CPU cycles, memory allocations, handles count"** |
| **`exporters/`** | ❌ **missing** | **"Export Adapters — CLI console, local files, OpenTelemetry"** |
| `audit/` | ❌ missing | Tamper-evident security log |
| `storage/` | ❌ missing | Telemetry SQLite schemas |
| `repository/` | ❌ missing | Telemetry repositories |
| `dashboards/` | ❌ missing | Read-only query layers |

Plus two undocumented-but-present packages: `validation/`, `errors/`.

**10 of 17 built. 7 missing.** The three in bold are exactly the functionality `src/diagnostics/` was drafted to provide.

---

## 4. Git History Evidence

### 4.1 Search coverage

```bash
git log --all --oneline --name-status -- 'src/diagnostics/**'
git log --all --diff-filter=A --pretty=... -- 'src/observability/**'
git rev-list --all --objects | grep -Ei "health-checker|performance-monitor|startup-profiler|diagnostics-exporter|metrics-collector|event-metrics"
git log --all --oneline -S "<each of the 6 symbols>" -- .
git branch -a ; git stash list ; git fsck --lost-found
```

### 4.2 Findings

**The 6 missing modules have never existed in any form.**

```
$ git rev-list --all --objects | grep -Ei "health-checker|performance-monitor|startup-profiler|diagnostics-exporter|metrics-collector|event-metrics"
(no output)
```
No blob with any of those filenames has ever been written to the object database — not on a branch, not in a dangling commit, not under a different path.

**`-S` content search finds each symbol in exactly one commit — the one that introduced the broken imports:**

```
HealthChecker         : 45f3b5a
PerformanceMonitor    : 45f3b5a
StartupProfiler       : 45f3b5a
DiagnosticsExporter   : 45f3b5a
MetricsCollector      : 45f3b5a
EventMetrics          : 45f3b5a
```
Each appears once, and only as the `import` statement in `diagnostics-manager.ts` plus its field declaration. Never as a definition.

**`src/diagnostics/` was written once and never revisited:**

```
$ git log --all --oneline --name-status -- 'src/diagnostics/**'
45f3b5a release(genesis): v2.19.0 Identity Capability
A  src/diagnostics/core/diagnostics-context.ts
A  src/diagnostics/core/diagnostics-errors.ts
A  src/diagnostics/core/diagnostics-manager.ts
A  src/diagnostics/core/diagnostics-report.ts
```
One commit, 4 files added, no modifications since.

**The successor arrived one day later:**

| Subsystem | First commit | Date |
| :--- | :--- | :--- |
| `src/diagnostics/` | `45f3b5a` | **2026-07-24** |
| `src/analytics/validation/diagnostics.ts` | `45f3b5a` | 2026-07-24 |
| `src/observability/` | `5297517` | **2026-07-25** |

**No hidden work exists:**

```
$ git branch -a
* main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main

$ git stash list
(empty)

$ git fsck --lost-found
dangling tree 11a756c5e400e46a2d0ad4e93af45399408a2af7
dangling blob a5d7ba575b9cb68d40d282dc7e58a7fe16b28814
```
One branch. No stash. Two dangling objects — one tree, one blob — far too few to contain 6 modules, and the `rev-list --all --objects` filename search (which covers reachable objects) already returned nothing.

### 4.3 Conclusions against the seven possibilities

| Possibility | Verdict |
| :--- | :--- |
| 1. Previously existed and was deleted | **No** — never a blob, never in any commit |
| 2. Exists in another branch | **No** — only `main` exists |
| 3. Exists in an unmerged commit | **No** — `--all` covers everything; nothing found |
| 4. Exists under a different filename | **Partially — and this is the key finding.** The *functionality* is specified under different paths inside `src/observability/` (`health/`, `resources/`, `exporters/`, `metrics/`), and the *data models* (`HealthRecord`, `ResourceRecord`, `DiagnosticRecord`) already exist there. The `src/diagnostics/` filenames themselves never existed. |
| 5. Planned but never implemented | **Yes** — this is the literal state |
| 6. Partially implemented elsewhere | **Yes** — `src/observability/` implements the models and the diagnostic-reporting path; `health/`, `resources/` and `exporters/` remain unbuilt there too |
| 7. Referenced accidentally | **Partially** — the 4 event-bus subscription strings (§2) and `new DiagnosticError()` are accidental references that were never valid |

---

## 5. Error Classification

One classification per error, with evidence.

### Errors 1–6 — missing modules → **D — STALE REFERENCE**

> *"The import or dependency no longer belongs to the architecture."*

| Evidence | Detail |
| :--- | :--- |
| Never existed | No blob, no commit, no branch (§4.2) |
| Superseded one day later | `src/observability/` (2026-07-25) vs `src/diagnostics/` (2026-07-24) |
| Superseding ADR claims the scope | ADR-021 line 7: *"we require system-wide observability (Metrics, Logs, Traces, **Diagnostics, Health**, Auditing, and **Resource Monitoring**)"*; line 41 lists *"Diagnostics, Health metrics, Resource snapshots"* as first-class telemetry records |
| Each has a documented home elsewhere | See mapping below |
| `src/diagnostics/` has no architectural mandate | Absent from every ADR, `DIRECTORY_STRUCTURE.md`, `ARCHITECTURE.md`, `MODULE_CONTRACT.md` |
| No consumer | 0 importers; unreachable from every entry point |

**Mapping of each stale specifier to its documented home:**

| Missing specifier | Documented home (`PACKAGE_STRUCTURE.md`) | Already-built support |
| :--- | :--- | :--- |
| `../health/health-checker` | `src/observability/health/` — *"Health Rules Engine"* | `HealthRecord` + `createHealth()` ✅ |
| `../performance/performance-monitor` | `src/observability/resources/` — *"Physical Resource Trackers"* | `ResourceRecord` + `createResource()` ✅ |
| `../performance/startup-profiler` | `src/observability/tracing/` / `utils/` — *"computes elapsed milliseconds"*, *"monotonic time wrappers"* | `telemetryClock.monotonicNow()` ✅ |
| `../reporting/diagnostics-exporter` | `src/observability/exporters/` — *"Export Adapters"* | `services/pipeline.ts` + `TelemetrySink` + `serializer.ts` ✅ |
| `../metrics/metrics-collector` | `src/observability/metrics/` | 6 files, 78 test assertions ✅ |
| `../metrics/event-metrics` | `src/observability/events/` + `metrics/` | `events/` is an `export {}` stub ⚠️ |

Note also that `PACKAGE_STRUCTURE.md` §3 declares: *"Subsystems outside of `src/observability/` are forbidden from importing files from packages other than `api/`, `contracts/`, or `models/`."* A `src/diagnostics/` that delegated to observability internals would violate the successor's own invariant — reinforcing that the draft has no place in the current architecture.

### Error 7 — `DiagnosticError` used as a value → **C — INCOMPLETE IMPLEMENTATION**

> *"The architecture expects functionality that was never finished."*

Classified separately from 1–6 because it is not a stale reference to a moved module; it is unfinished code inside a file that does exist.

| Evidence | Detail |
| :--- | :--- |
| Intent unfinishable from evidence | `const err = new DiagnosticError();` assigns to an unused variable inside an empty `catch`. Whether the intent was to log, to push into `context.errors`, or to rethrow is unrecoverable. |
| A plausible class exists but does not fit | `DiagnosticsError` (plural, in `diagnostics-errors.ts`) requires `message: string`; the call site passes none |
| Accompanied by placeholder markers | `moduleCount: 0, // placeholder`, hard-coded `healthScore: 100` |
| Not independently fixable | Even corrected, the file cannot compile while errors 1–6 stand |

### Not classified as A, B, or E

| Category | Why not |
| :--- | :--- |
| **A — RECOVERABLE** | Nothing to recover. `git rev-list --all --objects` proves no version ever existed. |
| **B — RENAMED / MOVED** | The *functionality* moved to `src/observability/`, but no equivalent module exists there yet (`health/`, `resources/`, `exporters/` are all missing). There is nothing to re-point an import at. Had `src/observability/health/health-checker.ts` existed, errors 1–6 would be category B. |
| **E — ARCHITECTURAL DEFECT** | The *errors* do not reveal a defect — they reveal an abandoned draft. **However, the investigation surfaced a genuine architectural gap that the errors merely point at**: AKIRA has three unrelated "Diagnostics" implementations, two of which are unreachable, and the platform has no working diagnostics capability at all. That is escalated in §7 as an architecture decision, not attributed to these 7 errors. |

---

## 6. Architecture Assessment

A combination is required, because the three implementations are in different states. Justified per subsystem:

### Subsystem A — `src/diagnostics/` → **STALE** (primary) + **PARTIALLY IMPLEMENTED** (secondary)

- **STALE** is primary: superseded one day after creation by a documented subsystem that claims its scope; documented nowhere itself; zero consumers; unreachable.
- **PARTIALLY IMPLEMENTED** is secondary and factual: 5 of 11 dependencies resolve, 6 were never written, and the file carries explicit placeholder markers.
- **Not CORRUPTED.** Unlike `HealthRuleEngine.ts` in Stage 1A — which was two modules concatenated into one file — nothing here was damaged. `git show 45f3b5a` confirms the file is byte-identical to how it was committed. It was born incomplete.

### Subsystem B — `src/observability/` → **COMPLETE BUT DISCONNECTED** (for what is built) + **PARTIALLY IMPLEMENTED** (as a whole)

- **COMPLETE BUT DISCONNECTED** for the 10 built packages: they compile (after Stage 1A), the telemetry model is coherent and immutable (`deepFreeze` throughout), the metrics package carries 78 real assertions — and **zero code outside `src/observability/` imports any of it**. Its own facade, `RuntimeVisibility`, is imported by nothing.
- **PARTIALLY IMPLEMENTED** as a whole: 7 of 17 documented packages absent, including the three the platform most needs (`health/`, `resources/`, `exporters/`), plus `events/` which is an `export {}` stub.

### Subsystem C — `src/analytics/validation/diagnostics.ts` → **COMPLETE AND CONNECTED**, but unverified

- Compiles, is exported through `analytics/validation/index.ts`, and is the only diagnostics code with a live consumer.
- Its only test lives in `src/analytics/tests/analytics.test.ts`, a hand-rolled script that produces **0 assertions** under vitest — so its behaviour is unverified in practice.
- Architecturally sound: reports schema validity and derived-data consistency for the analytics subsystem. Correctly infrastructure.

### Boundary compliance (Step 5)

The stated principle — Diagnostics is infrastructure and must not contain cognitive reasoning — **holds in all three implementations.**

| Check | A | B | C |
| :--- | :--- | :--- | :--- |
| Imports anything from `src/genesis/` | No | No | No |
| Contains memory / story / understanding / planning / reflection logic | No | No | No |
| Reports only infrastructure facts | Yes — uptime, memory, event rate, module counts, health score | Yes — diagnostic code, severity, component, message, suggested action | Yes — schema validity, derived-data consistency, rebuild state |
| Imports business/domain code | `compatibility/interfaces` only | Only `contracts/`, per its own invariant | `analytics/repository` — same subsystem |

`grep -rn "genesis" src/diagnostics src/observability` → no matches. **No boundary violation found.**

One boundary observation worth recording, though not a violation: `src/genesis/planning/health/` (HealthRuleEngine, HealthyRule, StalledRule, …) also uses the word "health", but it evaluates **plan** health — a cognitive judgement about a user's plan — and correctly lives in GENESIS. It shares nothing with platform diagnostics beyond vocabulary. Stage 1A's repairs there were to the cognitive subsystem, not to this one. The naming overlap is a legibility hazard, not a layering error.

---

## 7. Recommended Action

### Per error

| # | Error | Classification | Recommendation |
| ---: | :--- | :--- | :--- |
| 1 | `../health/health-checker` | D — Stale | **REMOVE AS STALE** |
| 2 | `../performance/performance-monitor` | D — Stale | **REMOVE AS STALE** |
| 3 | `../performance/startup-profiler` | D — Stale | **REMOVE AS STALE** |
| 4 | `../reporting/diagnostics-exporter` | D — Stale | **REMOVE AS STALE** |
| 5 | `../metrics/metrics-collector` | D — Stale | **REMOVE AS STALE** |
| 6 | `../metrics/event-metrics` | D — Stale | **REMOVE AS STALE** |
| 7 | `DiagnosticError` used as a value | C — Incomplete | **REMOVE AS STALE** (as part of the same file) |

"Remove as stale" here means **removing `src/diagnostics/` in its entirety** (4 files, 182 lines) — not editing the imports out of a file that would then do nothing. Deleting only the imports would leave a `DiagnosticsManager` whose constructor references undefined classes: a compile-clean file that throws on first use. That is strictly worse than the current honest breakage.

### But this recommendation is BLOCKED pending your decision

**I am not executing it.** The Stage 1B stop condition requires all four gates, and one fails:

| Gate | Status |
| :--- | :--- |
| ✓ Root cause is known | **Met** — abandoned draft, superseded 2026-07-25, never in Git history |
| ✓ Intended behavior is supported by repository evidence | **Met** — `PACKAGE_STRUCTURE.md` assigns every missing module a home in `src/observability/` |
| ✓ The repair preserves architectural boundaries | **Met** — removal touches nothing; 0 importers, 0 entry-point references |
| ✗ No new functionality is being invented | **Met for removal** — but see below |

The failing consideration is not on that list, and it is the reason I am stopping:

> **Deleting `src/diagnostics/` makes `tsc` report 7 fewer errors while leaving AKIRA with no working diagnostics capability whatsoever.**

That is precisely the outcome this program exists to prevent. After removal:
- `src/observability/` still has **zero external consumers** and its `health/`, `resources/` and `exporters/` packages still do not exist.
- The platform still logs through 192 `console.*` calls and two byte-identical duplicate loggers.
- `tsc` would be green — and the green would not represent reality.

Deletion is also explicitly constrained by this stage's own rules ("Do not delete features"), and `src/diagnostics/` is nominally the "Runtime Diagnostics" pillar listed in the project's AKIRA OS responsibilities.

### **ESCALATE FOR ARCHITECTURE REVIEW — one decision, three options**

| | Option | Work | `tsc` | Delivers a diagnostics capability? |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Remove `src/diagnostics/`** and record ADR-021 / `src/observability/` as the single owner of Diagnostics, Health and Resource monitoring. Add a `Status: Superseded` note where appropriate. | ~1 hour | **0 errors** | **No** — defers it |
| **2** | **Remove `src/diagnostics/`, then build `src/observability/health/` + `resources/` + `exporters/`** against the existing `HealthRecord` / `ResourceRecord` / `TelemetrySink` contracts, and wire `RuntimeVisibility` into `src/server.ts`. | Days | 0 errors | **Yes** — and it is documented, modelled and testable |
| **3** | **Complete `src/diagnostics/` in place** by writing the 6 missing modules. | Days | 0 errors | Yes, but duplicates ADR-021, requires inventing a health-scoring algorithm (`HealthChecker.evaluate`) and a shape for `MetricsCollector` (which has no call site at all), and produces a second undocumented subsystem |

**My recommendation: Option 2**, sequenced as Option 1 first.

Rationale, in order of weight:
1. Option 3 requires **inventing functionality** — a health-scoring algorithm and a contract for `MetricsCollector` that no code specifies. This stage forbids that, and the Master Audit already identified fabricated capability as a root cause of AKIRA's condition.
2. Option 2's target is **already specified** (`PACKAGE_STRUCTURE.md` names all three packages and their responsibilities), **already modelled** (`HealthRecord` with `healthStatus`, `ResourceRecord` with CPU/RSS/heap/event-loop-lag/disk), and **already has an export mechanism** (`TelemetrySink` + `pipeline.ts`). It is completion, not invention.
3. Option 1 alone is honest and cheap, and is a strict prerequisite of Option 2 — so starting there costs nothing.
4. Option 2 also closes the finding that matters more than the 7 errors: it gives `src/observability/` its first real consumer, converting 3,242 lines of documented-but-disconnected code into working platform capability.

**Until you choose, `src/diagnostics/` stays exactly as it is and `tsc` reports 9 errors.** I would rather report 9 honest errors than 0 dishonest ones.

### Non-blocking follow-ups recorded, not acted on

| Item | Note |
| :--- | :--- |
| `DiagnosticsService` name collision | Subsystems B and C export the same class name with no shared interface. Worth disambiguating whichever survives. |
| 4 dead event subscriptions | `diagnostics-manager.ts:41-46` subscribes to `"module.lifecycle"`, `"capability.register"`, `"permission.grant"`, `"runtime.error"` — none exists in any event registry. If Option 3 were ever chosen, these must be corrected to `LifecycleEvents.*` / `CapabilityEvents.*`. |
| `src/observability/events/index.ts` | `export {}` with a comment deferring implementation. Same class of gap as `health/` and `resources/`. |
| `src/analytics/tests/analytics.test.ts` | Exercises subsystem C but produces 0 assertions under vitest (Master Audit CRIT-007). Subsystem C's behaviour is therefore unverified. |
