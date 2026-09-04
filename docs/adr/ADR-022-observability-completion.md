# ADR-022: Completing the Observability Platform

## Status

Accepted. Supersedes parts of [ADR-021](./ADR-021-observability-platform.md), which remains
Accepted for its layering and immutability decisions.

## Context

ADR-021 specified a four-layer observability platform: Instrumentation → Collection → Storage →
Presentation. What was actually built, in a single commit on 2026-07-25, was the top layer and
nothing beneath it.

The state found when this work began:

- **Complete and good**: the telemetry model (`models/`), factory, validator, serializer,
  correlation context, clock, id generator, the metrics engine, the structured logger, the trace
  service and the diagnostics service. 34 files, two test suites, all passing.
- **Missing entirely**: the `health/`, `resources/`, `audit/`, `storage/`, `repository/`,
  `exporters/` and `dashboards/` packages that `PACKAGE_STRUCTURE.md` describes.
- **The defect that made all of it inert**: `TelemetryServiceImpl` constructs
  `TelemetryPipelineImpl` with zero stages and a null sink. Every record the factory produced was
  validated and then dropped. A runtime probe confirmed `stages = 0, sink = null`.
- **Consequence**: no file outside `src/observability/` imported the subsystem. Not one. It was
  34 files of working code that could not have recorded anything, and no test noticed, because
  every test asserted on records it held itself rather than on records the system retained.

`events/index.ts` states the position plainly in its own comment: "Detailed implementations of
event-based recorders will be introduced in subsequent stabilization sprints." They were not.

## Conflict with ADR-021, and how it is resolved

ADR-021 mandates a SQLite-backed `Storage` layer with sliding-window retention (7 days of logs,
24 hours of spans), a `repository/` package, `exporters/`, and `dashboards/`. This ADR does not
build those, and the disagreement is deliberate.

1. **A second database is not what Alternative B rejected.** ADR-021 rejected reusing the event
   store for telemetry, on the grounds that high-frequency logs and spans would contend with
   domain events. That argument says telemetry must not pollute the event store. It does not
   establish that telemetry needs its own durable store — only that it must not share that one.

2. **Telemetry about a live process is not a durable record.** The recovery programme settled a
   persistence boundary for GENESIS: only the source-of-truth stream is durable, and everything
   derived is rebuilt. Health, latency and resource readings describe the process that is running
   now. After a restart they describe nothing. Persisting them buys retrieval of numbers whose
   subject no longer exists.

3. **Half of AKIRA cannot host a SQLite telemetry store.** Observability's most valuable signals
   originate on both sides of the client/server boundary. A SQLite storage layer is reachable from
   only one, so a durable-first design would leave browser-side signals with nowhere to go, or
   force a per-event RPC — the cost the `transient` event work was introduced to avoid.

4. **ADR-021 concedes the cost itself.** Its Tradeoffs section notes that high-volume tracing
   bloats the database and needs retention rules and compaction. A bounded in-memory buffer is
   that retention rule, arrived at directly.

**Decision**: the Collection layer is a bounded in-memory ring buffer. Storage and Presentation are
explicitly deferred, not abandoned — the seam ADR-021 designed for them is exactly what makes this
safe. `TelemetrySink` is an interface, and the store is one implementation of it; a SQLite sink or
an OpenTelemetry exporter can be added later by composing a different sink, with zero change to any
calling code. That is the decoupling ADR-021 promised, used as intended.

## Decision

### Flow

```
AKIRA OS actions (task completed, note written, vault change)
        │  publish()
        ▼
globalEventBus ──delivers──▶ PersistenceSubscriber
        │                    TimelineSubscriber
        │                    GenesisRealityAdapter
        │
        └── delivery outcome (subscriber id, duration, error?)
                    ▼
            EventBusObserver                    [observability/integration]
                    ├──▶ HealthRegistry         evidence ▶ status ▶ transition
                    └──▶ PerformanceMonitor     latency, error rate, p95
                                 │
                    health transitions only
                                 ▼
                    TelemetryFactory ▶ TelemetryService ▶ Pipeline
                                 ▼
                          TelemetryStore        [bounded ring buffer]
                                 ▼
                          query() consumers
```

### Ownership

| Concern              | Owner                                                          |
| -------------------- | -------------------------------------------------------------- |
| health state         | `observability/health/health-registry.ts`                      |
| performance state    | `observability/performance/performance-monitor.ts`             |
| resource measurement | `observability/resources/resource-sampler.ts`                  |
| telemetry records    | `observability/store/telemetry-store.ts`                       |
| diagnostic records   | `observability/diagnostics/diagnostics-service.ts`             |
| metrics aggregation  | `observability/metrics/` (pre-existing)                        |
| lifecycle            | `observability/composition.ts`                                 |
| exporting            | **deferred** — the `TelemetrySink` seam is the extension point |

Observability belongs to AKIRA OS. It reads the instrumentation bus; it does not import GENESIS,
and GENESIS neither owns nor initializes any part of it. A test asserts this statically.

### Input

One source: the platform event bus, via a delivery observer. It was chosen because it is where
real AKIRA work already flows, and because the bus deliberately swallows subscriber failures so one
subscriber cannot break another — meaning a subscriber could fail on every event forever with
nothing but a console line to show for it. That swallowed outcome is the most valuable health
signal available, and it was going nowhere.

Other candidate sources (AI providers, persistence internals, timeline queries) were deliberately
not wired. They are reachable through the same seam when there is a question they would answer.

### Output

Internal query APIs only. No UI surface and no exporter is built. A dashboard was considered and
rejected: nothing currently consumes health or latency, and building a page to display numbers
nobody has asked for repeats the mistake this ADR exists to correct.

### Health is derived, never declared

`HealthRegistry` has no concept of a "check function". Status is computed from counted successes
and failures, and there is no API to set it. A registered component with no observations reports
`unknown`, explicitly not `healthy`: absence of failure is not evidence of health. `unknown` has no
`HealthRecord` equivalent, and such transitions are skipped rather than coerced — no evidence, no
claim.

Records are emitted on status _transitions_ only. A subscriber handling a thousand events is a
thousand observations but one health fact.

### Resources: only what is measurable

`ResourceRecord` requires cpuLoadPercentage, memoryRssBytes, memoryHeapBytes, eventLoopLagMs and
diskFreeBytes. No AKIRA runtime can honestly produce all five. There is no portable CPU-percentage
API; `os.loadavg()` is Node-only, is a run-queue average rather than a percentage, and returns a
hardcoded `[0,0,0]` on Windows, which is this project's development platform. Free disk needs
`statfs`, absent in a browser.

The sampler therefore reports what it actually read and `describeResourceAvailability()` states
what this runtime can produce. An unmeasurable dimension is **absent**, never present-and-zero — a
zero meaning "not measured" is indistinguishable from a zero meaning "idle", and that ambiguity is
how a monitoring system starts lying.

## Consequences

- Observability composes from `src/akira-os/index.ts` (client/shared) and
  `src/instrumentation/server/index.ts` (server), via `observability/auto-compose.ts`.
  Client and server are separate module registries and therefore separate buses; each needs its own
  observer, or the persistence and timeline writes — server-only, and the ones that matter most —
  would be unobserved.
- Composition is idempotent and fully reversible. No timers, no connections, no bus subscription:
  the subsystem is passive and does work only while an event is being delivered.
- Every store is bounded by `store/retention.ts`, one cap per growth axis, mirroring
  `src/genesis/retention/policy.ts`.
- **`package.json` `sideEffects` changed from `false` to `["./src/observability/auto-compose.ts"]`.**
  The blanket `false` was a claim that no module has import-time side effects, which
  `auto-compose.ts` makes untrue; under it the composition was silently tree-shaken out of the
  production client bundle while every test still passed. Everything else remains shakeable.
- `auto-compose.ts` is a bare side-effect module rather than a call at the bottom of the AKIRA OS
  barrel (which is how `src/genesis/index.ts` does the equivalent). Calling an imported symbol at
  module scope there makes it a live cross-chunk reference, and rolldown panics computing the link:
  `Symbol "initializeObservability" ... should belong to a chunk`. It reports itself as a bundler
  bug; the indirection avoids it. Both call sites are asserted by tests.
- The `node:async_hooks` string still appears in the client bundle, inside
  `eval("require")("node:async_hooks")` in `services/context.ts`, guarded by
  `typeof window === "undefined"`. It is a string, not a dependency: the module is not bundled, the
  eval indirection exists precisely to stop the bundler resolving it, and the branch cannot execute
  in a browser. `better-sqlite3`, `node:fs`, `node:os` and `node:path` are absent from client
  assets.
